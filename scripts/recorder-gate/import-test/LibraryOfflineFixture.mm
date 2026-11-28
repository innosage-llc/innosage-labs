// Compiled only into the generated Simulator test app by add-ios-test.rb.
// The normal device project, signed archive and product JS contain no fixture.
#import <TargetConditionals.h>
#if !TARGET_OS_SIMULATOR
#error LibraryOfflineFixture is restricted to Simulator test builds.
#endif
#import <Foundation/Foundation.h>
// Public C export from React Native's RCTHTTPRequestHandler.h. The prebuilt
// React framework exposes this symbol; the test app only needs its Foundation ABI.
extern "C" void RCTSetCustomNSURLSessionConfigurationProvider(NSURLSessionConfiguration *(^provider)(void));

static NSURL *receiptURL(void) {
  NSURL *cache = [NSFileManager.defaultManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;
  return [cache URLByAppendingPathComponent:@"labs-library-http-observation.json"];
}

@interface LibraryOfflineProtocol : NSURLProtocol
@end

@implementation LibraryOfflineProtocol
static NSUInteger blocked;
static BOOL sentinelSeen;
static BOOL validated;
static NSString *runID;

+ (void)recordObservation {
  NSDictionary *record = @{@"run":runID, @"blockedRequests":@(blocked), @"sentinelBlocked":@(sentinelSeen),
                           @"offlineErrorObserved":@(validated)};
  NSData *json = [NSJSONSerialization dataWithJSONObject:record options:0 error:nil];
  [json writeToURL:receiptURL() atomically:YES];
}

+ (BOOL)canInitWithRequest:(NSURLRequest *)request {
  return [@[@"http",@"https"] containsObject:request.URL.scheme.lowercaseString];
}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request { return request; }
- (void)startLoading {
  @synchronized (LibraryOfflineProtocol.class) {
    if ([self.request.URL.absoluteString isEqualToString:@"https://127.0.0.1/library-offline-control"]) sentinelSeen = YES;
    else blocked++;
    [LibraryOfflineProtocol recordObservation];
  }
  [self.client URLProtocol:self didFailWithError:[NSError errorWithDomain:NSURLErrorDomain
                                                                   code:NSURLErrorNotConnectedToInternet userInfo:nil]];
}
- (void)stopLoading {}

+ (void)load {
  runID = [NSProcessInfo.processInfo.environment[@"RECORDER_LIBRARY_OFFLINE_RUN"] copy];
  if (!runID.length) return;
  [NSURLProtocol registerClass:self];
  NSURLSessionConfiguration *(^configuration)(void) = ^NSURLSessionConfiguration *{
    NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    config.protocolClasses = [@[LibraryOfflineProtocol.class] arrayByAddingObjectsFromArray:config.protocolClasses ?: @[]];
    return config;
  };
  RCTSetCustomNSURLSessionConfigurationProvider(configuration);
  NSURLSession *probe = [NSURLSession sessionWithConfiguration:configuration()];
  NSURL *sentinel = [NSURL URLWithString:@"https://127.0.0.1/library-offline-control"];
  [[probe dataTaskWithURL:sentinel completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    @synchronized (LibraryOfflineProtocol.class) {
      validated = [error.domain isEqualToString:NSURLErrorDomain] && error.code == NSURLErrorNotConnectedToInternet;
      [LibraryOfflineProtocol recordObservation];
    }
    [probe finishTasksAndInvalidate];
  }] resume];
}
@end
