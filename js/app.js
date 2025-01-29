cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.init();
const TAG_DETAILS_MAPPING = {
    "(0020,0013)": "instanceNumber",
    "(0020,000D)": "studyId",
    "(0020,000E)": "seriesId",
    "(0010,0010)": "patientName",
    "(0010,1010)": "patientAge",
    "(0008,1090)": "manufacturer",
    "(0028,0008)": "frames"
}



function enableTool(toolName, mouseButtonMask) {
    const apiTool = cornerstoneTools[`${toolName}Tool`];
    cornerstoneTools.addTool(apiTool);
    cornerstoneTools.setToolActive(toolName, { mouseButtonMask: mouseButtonMask });
}

function loadDicomInfo(metaDetails){
    $('#dicomInfo')[0].innerHTML = `
    <p>${metaDetails.patientName}</p>
    <p>${metaDetails.patientAge}</p>
    <p>${metaDetails.manufacturer}</p>
    `;
}

function loadAndViewImage(imageData) {
    let imageId = imageData.wadouri;
    const element = document.getElementById('dicomImage');
    cornerstone.loadImage(imageId).then(function(image) {
        const viewport = cornerstone.getDefaultViewportForImage(element, image);
        cornerstone.displayImage(element, image, viewport);
        loadDicomInfo(imageData.metaDetails);
        if(!loaded){
            enableTool('Wwwc', 1);
            enableTool('Pan', 2);
            enableTool('Zoom', 4);
            loaded = true;
        }
        
    }, function(err) {
        console.log(err);
    });
}


function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}


async function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    
    let items = evt.dataTransfer.items;
    let files = [];
    
    if (items) {
        for (let item of items) {
            if (item.kind === "file") {
                let entry = item.webkitGetAsEntry();
                if (entry.isFile) {
                    files.push(item.getAsFile());
                } else if (entry.isDirectory) {
                    files = files.concat(await readDirectory(entry));
                }
            }
        }
    } else {
        files = Array.from(evt.dataTransfer.files);
    }
    
    for (let file of files) {
        let metaDetails = await dumpFile(file);
        let frames = parseInt(metaDetails.frames);
        let wadouri = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
        
        for (let i = 0; i < frames; i++) {
            let frameWadouri = `${wadouri}?frame=${i}`;
            images.push({
                file: file,
                wadouri: frameWadouri,
                metaDetails: metaDetails,
                instanceNumber: parseInt(metaDetails.instanceNumber) + i,
            });
        }
    }
    
    images.sort((a, b) => a.instanceNumber - b.instanceNumber);
    
    if (!loaded && images.length > 0) {
        dumpFile(images[0].file);
        loadAndViewImage(images[0]);
    }
    
    let totalLength = images.length;
    totalSliceElement.innerHTML = totalLength;
    imageSlider.attr("max", totalLength);
    
    if (images.length > 1) {
        $($("#slider-div")[0]).attr("style", false);
    }
}

async function readDirectory(directoryEntry) {
    let reader = directoryEntry.createReader();
    let files = [];
    
    async function readEntries() {
        return new Promise((resolve, reject) => {
            reader.readEntries(async (entries) => {
                if (entries.length === 0) {
                    resolve(files);
                    return;
                }
                for (let entry of entries) {
                    if (entry.isFile) {
                        files.push(await getFile(entry));
                    } else if (entry.isDirectory) {
                        files = files.concat(await readDirectory(entry));
                    }
                }
                resolve(await readEntries());
            }, reject);
        });
    }
    
    return readEntries();
}

async function getFile(fileEntry) {
    return new Promise((resolve, reject) => {
        fileEntry.file(resolve, reject);
    });
}


function filterDetails(tag, value, metaDetails){
    if(tag in TAG_DETAILS_MAPPING && TAG_DETAILS_MAPPING[tag]){
        metaDetails[TAG_DETAILS_MAPPING[tag]] = value;
    }
}


async function dumpFile(file) {
    modalData = {};
    clipboardHistory = {};

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
        patientName: null,
        patientAge: null,
        manufacturer: null,
        frames: "1"
    }

    dumpDataSet(dataSet, output, metaDetails);

    document.getElementById('dropZone').innerHTML = output.join('');
    showCopyIcon();
    return metaDetails;
}

function generateUUID() {
    return crypto.randomUUID();
}

function performSearch(value){
    let table = document.querySelector('tbody');
    if(!table){
        return;
    }
    let tr = table.getElementsByTagName('tr');
    for (const row of tr) {
        const td = row.getElementsByTagName('td');
        let found = false;
        for (const cell of td) {
            if (cell.innerHTML.toUpperCase().indexOf(value.toUpperCase()) > -1) {
                found = true;
                break;
            }
        }
        row.style.display = found ? '' : 'none';
    }
}

function copyToClipboard(uuid){
    const dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    dummy.value = clipboardHistory[uuid];
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);
}

function showCopyIcon(){
    $("td[show='copy']").each(function(){
        let content = $(this).html();
        let uuid = generateUUID();
        clipboardHistory[uuid]= content;
        $(this).html(content + " <i class=\"bi bi-copy\" onclick=\"copyToClipboard(`"+uuid+"`)\"></i>");
        $(this).attr("show", "copied");
    })
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

