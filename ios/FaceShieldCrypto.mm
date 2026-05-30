/**
 * FaceShieldCrypto.mm — iOS Crypto Native Module
 *
 * Exposed as NativeModules.FaceShieldCrypto
 *
 * Uses iOS Security framework + CommonCrypto:
 *  - generateKey: SecRandomCopyBytes → 256-bit hex key
 *  - sha256Sync:  CC_SHA256 (CommonCrypto)
 *
 * Keys for MMKV are stored in the iOS Keychain / Secure Enclave
 * via react-native-keychain (separate library, no duplication here).
 */

#import <React/RCTBridgeModule.h>
#import <CommonCrypto/CommonCrypto.h>
#import <Security/Security.h>

@interface FaceShieldCrypto : NSObject <RCTBridgeModule>
@end

@implementation FaceShieldCrypto

RCT_EXPORT_MODULE()

/**
 * Generate a cryptographically secure 256-bit random key as a hex string.
 * Used as the MMKV encryption key on first launch.
 */
RCT_EXPORT_METHOD(generateKey:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    uint8_t bytes[32];
    int status = SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes);
    if (status != errSecSuccess) {
        reject(@"KEYGEN_ERROR", @"SecRandomCopyBytes failed", nil);
        return;
    }
    NSMutableString *hex = [NSMutableString stringWithCapacity:64];
    for (int i = 0; i < 32; i++) {
        [hex appendFormat:@"%02x", bytes[i]];
    }
    resolve(hex);
}

/**
 * Synchronous SHA-256 hash of a UTF-8 string.
 * Called from RecordFactory to generate tamper-detection hash.
 */
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(sha256Sync:(NSString *)input) {
    const char *cStr = [input UTF8String];
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(cStr, (CC_LONG)strlen(cStr), digest);

    NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
        [hex appendFormat:@"%02x", digest[i]];
    }
    return hex;
}

@end
