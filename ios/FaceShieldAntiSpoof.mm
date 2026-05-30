/**
 * FaceShieldAntiSpoof.mm — iOS Anti-Spoofing Native Module
 *
 * Exposed as NativeModules.FaceShieldAntiSpoof
 * Objective-C++ implementation mirrors the Android Kotlin version.
 *
 * Methods:
 *  computeMoireScore(pixels)    → NSNumber (Double)
 *  computeEntropy(pixels)       → NSNumber (Double)
 *  computeSpectralRatio(pixels) → NSDictionary {r, g, b}
 */

#import <React/RCTBridgeModule.h>
#include <cmath>
#include <vector>
#include <numeric>

@interface FaceShieldAntiSpoof : NSObject <RCTBridgeModule>
@end

@implementation FaceShieldAntiSpoof

RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(computeMoireScore:(NSArray<NSNumber *> *)pixels
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        NSUInteger count = pixels.count;
        std::vector<double> gray;
        gray.reserve(count / 4);

        for (NSUInteger i = 0; i + 3 < count; i += 4) {
            double r = pixels[i].doubleValue;
            double g = pixels[i+1].doubleValue;
            double b = pixels[i+2].doubleValue;
            gray.push_back(0.299 * r + 0.587 * g + 0.114 * b);
        }

        NSUInteger n = MIN(gray.size(), 256);
        double periodicEnergy = 0.0, totalEnergy = 0.0;

        for (int lag = 2; lag <= 16; lag++) {
            double corr = 0.0;
            for (NSUInteger k = 0; k + lag < n; k++) {
                corr += gray[k] * gray[k + lag];
            }
            periodicEnergy += fabs(corr);
        }
        for (NSUInteger k = 0; k < n; k++) {
            totalEnergy += gray[k] * gray[k];
        }

        double score = (totalEnergy == 0.0) ? 0.0 : fmin(1.0, fmax(0.0, periodicEnergy / totalEnergy));
        resolve(@(score));
    } @catch (NSException *e) {
        reject(@"MOIRE_ERROR", e.reason, nil);
    }
}

RCT_EXPORT_METHOD(computeEntropy:(NSArray<NSNumber *> *)pixels
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        int histogram[256] = {};
        NSUInteger count = 0;

        for (NSUInteger i = 0; i + 3 < pixels.count; i += 4) {
            int lum = (int)(0.299 * pixels[i].doubleValue
                          + 0.587 * pixels[i+1].doubleValue
                          + 0.114 * pixels[i+2].doubleValue);
            lum = MAX(0, MIN(255, lum));
            histogram[lum]++;
            count++;
        }

        double entropy = 0.0;
        if (count > 0) {
            for (int i = 0; i < 256; i++) {
                if (histogram[i] > 0) {
                    double p = (double)histogram[i] / count;
                    entropy -= p * log(p);
                }
            }
        }
        resolve(@(entropy));
    } @catch (NSException *e) {
        reject(@"ENTROPY_ERROR", e.reason, nil);
    }
}

RCT_EXPORT_METHOD(computeSpectralRatio:(NSArray<NSNumber *> *)pixels
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        double rSum = 0, gSum = 0, bSum = 0;
        NSUInteger count = 0;

        for (NSUInteger i = 0; i + 3 < pixels.count; i += 4) {
            rSum += pixels[i].doubleValue;
            gSum += pixels[i+1].doubleValue;
            bSum += pixels[i+2].doubleValue;
            count++;
        }

        if (count == 0) {
            resolve(@{@"r": @0, @"g": @0, @"b": @0});
            return;
        }
        resolve(@{
            @"r": @(rSum / count),
            @"g": @(gSum / count),
            @"b": @(bSum / count),
        });
    } @catch (NSException *e) {
        reject(@"SPECTRAL_ERROR", e.reason, nil);
    }
}

@end
