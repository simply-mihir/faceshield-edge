/**
 * Lambda: POST /attendance/sync
 *
 * Receives a batch of attendance records from the mobile device.
 * For each record:
 *  1. Validates JWT (issued by Datalake 3.0 auth service)
 *  2. Recomputes SHA-256 hash and compares with record.hash
 *  3. Writes valid records to DynamoDB attendance_records table
 *  4. Returns confirmedIds and failedIds
 *
 * Node.js 20.x runtime
 */
'use strict';

const {DynamoDBClient, BatchWriteItemCommand} = require('@aws-sdk/client-dynamodb');
const {marshall} = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ddb = new DynamoDBClient({region: process.env.AWS_REGION ?? 'ap-south-1'});
const TABLE = process.env.ATTENDANCE_TABLE ?? 'attendance_records';
const JWT_SECRET = process.env.JWT_SECRET; // injected at deploy time via Secrets Manager
const DEVICE_SECRET = process.env.DEVICE_SECRET ?? ''; // shared secret for tamper hash

exports.handler = async event => {
  // ── Auth ──────────────────────────────────────────────────
  const authHeader = event.headers?.Authorization ?? event.headers?.authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  try {
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return respond(401, {error: 'Unauthorized'});
  }

  // ── Parse body ───────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, {error: 'Invalid JSON body'});
  }

  const {deviceId, records, batchTimestamp} = payload;
  if (!Array.isArray(records) || records.length === 0) {
    return respond(400, {error: 'records array is required'});
  }

  const confirmedIds = [];
  const failedIds = [];
  const writeRequests = [];

  for (const record of records) {
    // ── SHA-256 tamper check ─────────────────────────────
    const expectedHash = crypto
      .createHash('sha256')
      .update(
        `${record.attendanceId}${record.employeeId}${record.timestamp}${record.similarityScore.toFixed(6)}${DEVICE_SECRET}`,
      )
      .digest('hex');

    if (expectedHash !== record.hash) {
      console.warn(`[attendance] Hash mismatch for ${record.attendanceId}`);
      failedIds.push(record.attendanceId);
      continue;
    }

    // ── Stage DynamoDB write ─────────────────────────────
    writeRequests.push({
      PutRequest: {
        Item: marshall({
          employeeId: record.employeeId,           // Partition key
          timestamp: record.timestamp,             // Sort key
          attendanceId: record.attendanceId,
          name: record.name,
          locationTag: record.locationTag,
          livenessChallenge: record.livenessChallenge,
          similarityScore: String(record.similarityScore),
          hash: record.hash,
          deviceId,
          syncedAt: new Date().toISOString(),
        }),
      },
    });
    confirmedIds.push(record.attendanceId);
  }

  // ── Batch write to DynamoDB (max 25 per call) ────────────
  if (writeRequests.length > 0) {
    const CHUNK = 25;
    for (let i = 0; i < writeRequests.length; i += CHUNK) {
      const chunk = writeRequests.slice(i, i + CHUNK);
      await ddb.send(
        new BatchWriteItemCommand({
          RequestItems: {[TABLE]: chunk},
        }),
      );
    }
  }

  // ── Log sync audit ───────────────────────────────────────
  console.log(
    JSON.stringify({
      event: 'attendance_sync',
      deviceId,
      batchTimestamp,
      confirmed: confirmedIds.length,
      failed: failedIds.length,
    }),
  );

  return respond(200, {
    confirmedIds,
    failedIds,
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
