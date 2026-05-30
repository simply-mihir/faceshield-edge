/**
 * FaceShieldFrameBufferModule.mm — iOS frame buffer bridge
 *
 * Exposes FaceShieldFrameBuffer.shared.currentFrame to JS as
 * NativeModules.FaceShieldFrameBuffer.getCurrentFrame()
 */

#import <React/RCTBridgeModule.h>

// Forward declaration of the shared buffer (defined in FaceShieldFrameProcessorPlugin.mm)
@interface FaceShieldFrameBuffer : NSObject
@property (nonatomic, strong, nullable) NSData *currentFrame;
+ (instancetype)shared;
@end

@interface FaceShieldFrameBufferModule : NSObject <RCTBridgeModule>
@end

@implementation FaceShieldFrameBufferModule

RCT_EXPORT_MODULE(FaceShieldFrameBuffer)

RCT_EXPORT_METHOD(getCurrentFrame:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSData *frame = FaceShieldFrameBuffer.shared.currentFrame;
    if (!frame) {
        reject(@"NO_FRAME", @"No camera frame available yet", nil);
        return;
    }

    const uint8_t *bytes = (const uint8_t *)frame.bytes;
    NSUInteger length = frame.length;

    NSMutableArray *result = [NSMutableArray arrayWithCapacity:length];
    for (NSUInteger i = 0; i < length; i++) {
        [result addObject:@(bytes[i])];
    }
    resolve(result);
}

@end
