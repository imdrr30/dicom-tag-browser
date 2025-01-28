cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.init();


function enableTool(toolName, mouseButtonMask) {
    const apiTool = cornerstoneTools[`${toolName}Tool`];
    cornerstoneTools.addTool(apiTool);
    cornerstoneTools.setToolActive(toolName, { mouseButtonMask: mouseButtonMask });
}


function loadAndViewImage(imageId) {
    const element = document.getElementById('dicomImage');
    cornerstone.loadImage(imageId).then(function(image) {
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.displayImage(element, image, viewport);
        enableTool('Wwwc', 1);
        enableTool('Pan', 2);
        enableTool('Zoom', 4);
    }, function(err) {
        alert(err);
    });
}