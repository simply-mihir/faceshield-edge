/**
 * FaceShieldFrameProcessorPlugin.mm — iOS VisionCamera v3 frame processor
 *
 * Converts each CVPixelBuffer (BGRA or YUV) from the front camera into
 * a flat RGBA byte array and stores it in the shared FaceShieldFrameBuffer.
 * TFLiteRunner reads from FaceShieldFrameBuffer.currentFrame on each inference call.
 *
 * Registered with VisionCamera via VISION_EXPORT_FRAME_PROCESSOR macro.
 */

#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/Frame.h>
#import <CoreVideo/CoreVideo.h>
#import <Accelerate/Accelerate.h>

// ── Shared frame buffer (Objective-C singleton) ──────────────────────────────
@interface FaceShieldFrameBuffer : NSObject
@property (nonatomic, strong, nullable) NSData *currentFrame;
@property (nonatomic, assign) int frameWidth;
@property (nonatomic, assign) int frameHeight;
+ (instancetype)shared;
@end

@implementation FaceShieldFrameBuffer
+ (instancetype)shared {
    static FaceShieldFrameBuffer *instance;
    static dispatch_once_t token;
    dispatch_once(&token, ^{ instance = [FaceShieldFrameBuffer new]; });
    return instance;
}
@end

// ── Frame Processor Plugin ───────────────────────────────────────────────────
@interface FaceShieldFrameProcessorPlugin : FrameProcessorPlugin
@end

@implementation FaceShieldFrameProcessorPlugin

- (instancetype)initWithProxy:(VisionCameraProxyHolder *)proxy
                      options:(NSDictionary *)options {
    self = [super initWithProxy:proxy options:options];
    return self;
}

- (id)callback:(Frame *)frame withArguments:(NSDictionary *)arguments {
    CVPixelBufferRef pixelBuffer = CMSampleBufferGetImageBuffer(frame.buffer);
    if (!pixelBuffer) return @{@"frameReady": @NO};

    CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);

    size_t width  = CVPixelBufferGetWidth(pixelBuffer);
    size_t height = CVPixelBufferGetHeight(pixelBuffer);
    OSType format = CVPixelBufferGetPixelFormatType(pixelBuffer);

    NSData *rgbaData = nil;

    if (format == kCVPixelFormatType_32BGRA) {
        // BGRA → RGBA swap via vImage
        vImage_Buffer src = {
            .data     = CVPixelBufferGetBaseAddress(pixelBuffer),
            .width    = width,
            .height   = height,
            .rowBytes = CVPixelBufferGetBytesPerRow(pixelBuffer),
        };

        uint8_t *rgbaBytes = (uint8_t *)malloc(width * height * 4);
        vImage_Buffer dst = {
            .data     = rgbaBytes,
            .width    = width,
            .height   = height,
            .rowBytes = width * 4,
        };

        // BGRA → RGBA channel permutation: [2,1,0,3]
        const uint8_t permuteMap[4] = {2, 1, 0, 3};
        vImagePermuteChannels_ARGB8888(&src, &dst, permuteMap, kvImageNoFlags);

        rgbaData = [NSData dataWithBytesNoCopy:rgbaBytes length:width * height * 4 freeWhenDone:YES];

    } else if (format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange ||
               format == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange) {
        // YUV NV12 → RGBA via vImage
        rgbaData = [self convertNV12ToRGBA:pixelBuffer width:width height:height];
    }

    CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);

    if (rgbaData) {
        FaceShieldFrameBuffer.shared.currentFrame = rgbaData;
        FaceShieldFrameBuffer.shared.frameWidth   = (int)width;
        FaceShieldFrameBuffer.shared.frameHeight  = (int)height;
    }

    return @{
        @"frameReady": @(rgbaData != nil),
        @"width":  @(width),
        @"height": @(height),
    };
}

- (NSData *)convertNV12ToRGBA:(CVPixelBufferRef)pixelBuffer
                        width:(size_t)width
                       height:(size_t)height {
    // Y plane
    uint8_t *yPlane = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0);
    size_t yStride  = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0);
    // UV plane
    uint8_t *uvPlane = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1);
    size_t uvStride  = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1);

    uint8_t *rgba = (uint8_t *)malloc(width * height * 4);
    size_t idx = 0;

    for (size_t row = 0; row < height; row++) {
        for (size_t col = 0; col < width; col++) {
            int y = yPlane[row * yStride + col] - 16;
            size_t uvRow = row / 2;
            size_t uvCol = (col / 2) * 2;
            int u = uvPlane[uvRow * uvStride + uvCol]     - 128;
            int v = uvPlane[uvRow * uvStride + uvCol + 1] - 128;

            int r = (298 * y + 409 * v + 128) >> 8;
            int g = (298 * y - 100 * u - 208 * v + 128) >> 8;
            int b = (298 * y + 516 * u + 128) >> 8;

            rgba[idx++] = (uint8_t)MAX(0, MIN(255, r));
            rgba[idx++] = (uint8_t)MAX(0, MIN(255, g));
            rgba[idx++] = (uint8_t)MAX(0, MIN(255, b));
            rgba[idx++] = 255;
        }
    }
    return [NSData dataWithBytesNoCopy:rgba length:width * height * 4 freeWhenDone:YES];
}

VISION_EXPORT_FRAME_PROCESSOR(FaceShieldFrameProcessorPlugin, faceShieldProcessFrame)

@end
