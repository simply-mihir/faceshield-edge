/**
 * FaceShieldPreprocess.mm — iOS Image Preprocessing Native Module
 *
 * Exposed as NativeModules.FaceShieldPreprocess
 * Objective-C++ counterpart of FaceShieldPreprocessModule.kt
 *
 * cropSync, resizeSync: blocking synchronous (isBlockingSynchronousMethod)
 * applyCLAHE:           async promise (heavier computation)
 */

#import <React/RCTBridgeModule.h>
#include <cmath>
#include <vector>
#include <algorithm>

@interface FaceShieldPreprocess : NSObject <RCTBridgeModule>
@end

@implementation FaceShieldPreprocess

RCT_EXPORT_MODULE()

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(cropSync:(NSArray<NSNumber *> *)pixels
                                        x:(nonnull NSNumber *)x
                                        y:(nonnull NSNumber *)y
                                        w:(nonnull NSNumber *)w
                                        h:(nonnull NSNumber *)h) {
    NSUInteger total = pixels.count;
    int side = (int)sqrt(total / 4.0);

    int x0 = MAX(0, MIN(side - 1, (int)(x.doubleValue * side)));
    int y0 = MAX(0, MIN(side - 1, (int)(y.doubleValue * side)));
    int x1 = MAX(0, MIN(side,     (int)((x.doubleValue + w.doubleValue) * side)));
    int y1 = MAX(0, MIN(side,     (int)((y.doubleValue + h.doubleValue) * side)));

    NSMutableArray *result = [NSMutableArray array];
    for (int row = y0; row < y1; row++) {
        for (int col = x0; col < x1; col++) {
            NSUInteger base = (row * side + col) * 4;
            if (base + 3 < total) {
                [result addObject:pixels[base]];
                [result addObject:pixels[base + 1]];
                [result addObject:pixels[base + 2]];
                [result addObject:pixels[base + 3]];
            }
        }
    }
    return result;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(resizeSync:(NSArray<NSNumber *> *)pixels
                                         targetW:(nonnull NSNumber *)targetW
                                         targetH:(nonnull NSNumber *)targetH) {
    NSUInteger total = pixels.count;
    int side = (int)sqrt(total / 4.0);
    int tW = targetW.intValue;
    int tH = targetH.intValue;

    double xRatio = (double)side / tW;
    double yRatio = (double)side / tH;

    NSMutableArray *result = [NSMutableArray arrayWithCapacity:tW * tH * 4];
    for (int row = 0; row < tH; row++) {
        for (int col = 0; col < tW; col++) {
            int srcRow = MIN(side - 1, (int)(row * yRatio));
            int srcCol = MIN(side - 1, (int)(col * xRatio));
            NSUInteger base = (srcRow * side + srcCol) * 4;
            if (base + 3 < total) {
                [result addObject:pixels[base]];
                [result addObject:pixels[base + 1]];
                [result addObject:pixels[base + 2]];
                [result addObject:pixels[base + 3]];
            } else {
                [result addObject:@0]; [result addObject:@0];
                [result addObject:@0]; [result addObject:@255];
            }
        }
    }
    return result;
}

RCT_EXPORT_METHOD(applyCLAHE:(NSArray<NSNumber *> *)pixels
                  clipLimit:(nonnull NSNumber *)clipLimit
                  tileGrid:(nonnull NSNumber *)tileGrid
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            NSUInteger total = pixels.count;
            int side = (int)sqrt(total / 4.0);
            int grid = tileGrid.intValue;
            double clip = clipLimit.doubleValue;

            NSMutableArray *output = [NSMutableArray arrayWithArray:pixels];

            int tileW = (side + grid - 1) / grid;
            int tileH = (side + grid - 1) / grid;

            for (int tileRow = 0; tileRow < grid; tileRow++) {
                for (int tileCol = 0; tileCol < grid; tileCol++) {
                    int x0 = tileCol * tileW;
                    int y0 = tileRow * tileH;
                    int x1 = MIN(x0 + tileW, side);
                    int y1 = MIN(y0 + tileH, side);

                    int hist[256] = {};
                    for (int row = y0; row < y1; row++) {
                        for (int col = x0; col < x1; col++) {
                            NSUInteger base = (row * side + col) * 4;
                            if (base + 2 < total) {
                                int lum = (int)(0.299 * [pixels[base] doubleValue]
                                              + 0.587 * [pixels[base+1] doubleValue]
                                              + 0.114 * [pixels[base+2] doubleValue]);
                                hist[MAX(0, MIN(255, lum))]++;
                            }
                        }
                    }

                    int clipCount = (int)(clip * (x1-x0) * (y1-y0) / 256);
                    int excess = 0;
                    for (int i = 0; i < 256; i++) {
                        if (hist[i] > clipCount) { excess += hist[i] - clipCount; hist[i] = clipCount; }
                    }
                    int perBin = excess / 256;
                    for (int i = 0; i < 256; i++) hist[i] += perBin;

                    int cdf[256] = {};
                    cdf[0] = hist[0];
                    for (int i = 1; i < 256; i++) cdf[i] = cdf[i-1] + hist[i];
                    int cdfMin = 0;
                    for (int i = 0; i < 256; i++) { if (cdf[i] > 0) { cdfMin = cdf[i]; break; } }
                    int totalPx = (y1-y0) * (x1-x0);

                    for (int row = y0; row < y1; row++) {
                        for (int col = x0; col < x1; col++) {
                            NSUInteger base = (row * side + col) * 4;
                            if (base + 2 < total) {
                                int lum = (int)(0.299 * [pixels[base] doubleValue]
                                              + 0.587 * [pixels[base+1] doubleValue]
                                              + 0.114 * [pixels[base+2] doubleValue]);
                                lum = MAX(0, MIN(255, lum));
                                int newLum = (totalPx > cdfMin) ? (int)(((double)(cdf[lum] - cdfMin) / (totalPx - cdfMin)) * 255) : lum;
                                double scale = (lum == 0) ? 1.0 : (double)newLum / lum;
                                output[base]   = @(MIN(255, (int)([pixels[base]   doubleValue] * scale)));
                                output[base+1] = @(MIN(255, (int)([pixels[base+1] doubleValue] * scale)));
                                output[base+2] = @(MIN(255, (int)([pixels[base+2] doubleValue] * scale)));
                            }
                        }
                    }
                }
            }
            resolve(output);
        } @catch (NSException *e) {
            reject(@"CLAHE_ERROR", e.reason, nil);
        }
    });
}

@end
