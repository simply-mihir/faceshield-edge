/**
 * Lambda: POST /enrollment/sync
 *
 * Receives an EmployeeRecord (embeddings + metadata) from the device.
 * Validates JWT, stores embeddings to DynamoDB employee_embeddings table,
 * writes audit hash to S3 (raw embeddings never in S3 — hash only).
 *
 * Node.js 20.x runtime
 */
'use strict';

const {DynamoDBClient, PutItemCommand} = require('@aws-sdk/client-dynamodb');
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');
const {marshall} = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ddb = new DynamoDBClient({region: process.env.AWS_REGION ?? 'ap-south-1'});
const s3 = new S3Client({region: process.env.AWS_REGION ?? 'ap-south-1'});

const EMPLOYEE_TABLE = process.env.EMPLOYEE_TABLE ?? 'employee_embeddings';
const AUDIT_BUCKET = process.env.AUDIT_BUCKET ?? 'faceshield-audit';
const JWT_SECRET = process.env.JWT_SECRET;

exports.handler = async event => {
  // ── Auth ─────────────────────────────────────────────────
  const authHeader = event.headers?.Authorization ?? event.headers?.authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return respond(401, {error: 'Unauthorized'});
  }

  // ── Parse body ───────────────────────────────────────────
  let record;
  try {
    record = JSON.parse(event.body);
  } catch {
    return respond(400, {error: 'Invalid JSON body'});
  }

  const {employeeId, name, enrolledAt, embeddings, syncStatus} = record;
  if (!employeeId || !embeddings || !Array.isArray(embeddings)) {
    return respond(400, {error: 'employeeId and embeddings are required'});
  }

  // ── Validate embedding dimensions ────────────────────────
  for (const emb of embeddings) {
    if (!Array.isArray(emb) || emb.length !== 128) {
      return respond(400, {error: 'Each embedding must be 128-dim'});
    }
  }

  // ── Store to DynamoDB ────────────────────────────────────
  await ddb.send(
    new PutItemCommand({
      TableName: EMPLOYEE_TABLE,
      Item: marshall({
        employeeId,
        name: name ?? 'Unknown',
        enrolledAt: enrolledAt ?? new Date().toISOString(),
        embeddings: JSON.stringify(embeddings), // stored as JSON string
        embeddingCount: embeddings.length,
        syncedAt: new Date().toISOString(),
        schemaVersion: '1.0',
      }),
    }),
  );

  // ── Write audit hash to S3 (no raw embeddings) ──────────
  const embeddingHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(embeddings))
    .digest('hex');

  const today = new Date().toISOString().slice(0, 10);
  await s3.send(
    new PutObjectCommand({
      Bucket: AUDIT_BUCKET,
      Key: `audit/${employeeId}/${today}/embedding_hash.json`,
      Body: JSON.stringify({
        employeeId,
        embeddingHash,
        enrolledAt,
        syncedAt: new Date().toISOString(),
      }),
      ContentType: 'application/json',
    }),
  );

  console.log(
    JSON.stringify({
      event: 'enrollment_sync',
      employeeId,
      embeddingCount: embeddings.length,
    }),
  );

  return respond(200, {
    employeeId,
    message: 'Enrollment synced successfully',
    serverTimestamp: new Date().toISOString(),
  });
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  };
}
