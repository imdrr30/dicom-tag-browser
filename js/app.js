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
        if(!loaded){
            enableTool('Wwwc', 1);
            enableTool('Pan', 2);
            enableTool('Zoom', 4);
            loaded = true;
        }
        
    }, function(err) {
        alert(err);
    });
}


function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}


// this function gets called once the user drops the file onto the div
async function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    // Get the FileList object that contains the list of files that were dropped
    let files = evt.dataTransfer.files;

    // this UI is only built for a single file so just dump the first one

    for(let file of files){
        let wadouri = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
        let metaDetails = await dumpFile(file);
        images.push({
            file: file,
            wadouri: wadouri,
            metaDetails: metaDetails,
            instanceNumber: parseInt(metaDetails.instanceNumber),
        });
        
    }

    images.sort((a, b) => a.instanceNumber - b.instanceNumber);
    if(!loaded){
        dumpFile(images[0].file);
        loadAndViewImage(images[0].wadouri);
    }

    let totalLength = images.length;
    totalSliceElement.innerHTML = totalLength;
    imageSlider.attr("max", totalLength);

    if(images.length > 1){
        $($("#slider-div")[0]).attr("style",false);
    }

}

// This function will read the file into memory and then start dumping it
async function dumpFile(file) {
    // Clear any data currently being displayed
    document.getElementById('dropZone').innerHTML = '';
    modalData = {};

    // Create a promise to read the file
    const fileData = await readFile(file);

    // Convert ArrayBuffer to Uint8Array for dicomParser
    const byteArray = new Uint8Array(fileData);
    const dataSet = dicomParser.parseDicom(byteArray);

    // Recursively dump the dataset
    const output = [];
    let metaDetails = {
        instanceNumber: "0",
        instanceId: null,
        seriesId: null,
        studyId: null,
        PatientName: null,
        PatientAge: null,
    }
    dumpDataSet(dataSet, output, metaDetails);

    // Combine the output into a single string and update the DOM
    document.getElementById('dropZone').innerHTML = output.join('');
    return metaDetails;
}

// Helper function that returns a Promise for FileReader
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function () {
            resolve(reader.result);  // Resolve with the ArrayBuffer
        };

        reader.onerror = function (error) {
            reject(error);  // Reject on error
        };

        reader.readAsArrayBuffer(file);  // Read the file
    });
}

