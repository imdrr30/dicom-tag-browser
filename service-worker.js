const CACHE_NAME = 'dicom-browser-v1';
const ASSETS_TO_CACHE = [
    '/',
    'index.html',
    'css/app.css',
    'css/select2.min.css',
    'css/bootstrap.min.css',
    'css/fonts/bootstrap-icons.woff2',
    'css/bootstrap-icons.min.css',
    'js/app.js',
    'js/app.pwa.js',
    'js/bootstrap.bundle.min.js',
    'js/cornerstone.js',
    'js/cornerstoneMath.min.js',
    'js/cornerstoneTools.js',
    'js/cornerstoneWADOImageLoader.bundle.min.js',
    'js/dicomParser.min.js',
    'js/DicomTags.js',
    'js/hammer.js',
    'js/initializeWebWorkers.js',
    'js/jquery-3.7.1.min.js',
    'js/jszip.min.js',
    'js/select2.min.js',
    'js/uids.js',
    'images/logo.webp'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then((response) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((cache) => cache !== CACHE_NAME).map((cache) => caches.delete(cache))
            );
        })
    );
});
