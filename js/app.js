cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.init();
function isASCII(str) {
    return /^[\x00-\x7F]*$/.test(str);
}

let modalData = {};
let images = {};
let currentSeries = "";
let clipboardHistory = {};

let myModal = new bootstrap.Modal(document.getElementById('myModal'));
let dicomImage = document.getElementById('dicomImage');
cornerstone.enable(dicomImage);
let loaded = false;
let totalSliceElement = $("#totalSlice")[0]
let currentSliceElement = $("#currentSlice")[0]
let imageSlider = $($("#dicomSlice")[0])
const toastLiveExample = document.getElementById('liveToast')
const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toastLiveExample)
const toastMessage = document.getElementById('toast-body')



const TAG_DETAILS_MAPPING = {
    "(0020,0013)": "instanceNumber",
    "(0020,000D)": "studyId",
    "(0020,000E)": "seriesId",
    "(0010,0010)": "patientName",
    "(0010,1010)": "patientAge",
    "(0008,1090)": "manufacturer",
    "(0028,0008)": "frames",
    "(0008,103E)": "seriesDescription"
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
    <p>${metaDetails.seriesDescription}</p>
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
    showNotification(`<div class="spinner-border text-secondary" role="status"></div><span class="m-3">Loading files. Please wait...</span>`);
    
    let items = evt.dataTransfer.items;
    let files = [];
    
    if (items) {
        for (let item of items) {
            if (item.kind === "file") {
                let entry = item.webkitGetAsEntry();
                if (entry) {
                    files = files.concat(await traverseFileTree(entry));
                }
            }
        }
    } else {
        files = Array.from(evt.dataTransfer.files);
    }
    
    for (let file of files) {
        let metaDetails;
        try{
            metaDetails = await dumpFile(file, false);
        }
        catch(e){
            continue;
        }
        let frames = parseInt(metaDetails.frames);
        let wadouri = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
        
        if (!(metaDetails.seriesId in images)) {
            images[metaDetails.seriesId] = [];
        }
        
        if (currentSeries === "") {
            currentSeries = metaDetails.seriesId;
        }
        
        for (let i = 0; i < frames; i++) {
            let frameWadouri = `${wadouri}?frame=${i}`;
            images[metaDetails.seriesId].push({
                file: file,
                wadouri: frameWadouri,
                metaDetails: metaDetails,
                instanceNumber: parseInt(metaDetails.instanceNumber) + i,
            });
        }
    }
    
    for (let series in images) {
        images[series].sort((a, b) => a.instanceNumber - b.instanceNumber);
    }
    
    loadSeries(currentSeries);
    refreshSeries();
    showNotification("Files loaded successfully");
    
}

function showNotification(message){
    toastMessage.innerHTML = message;
    toastBootstrap.show();
}

async function traverseFileTree(entry) {
    let files = [];
    if (entry.isFile) {
        files.push(await getFile(entry));
    } else if (entry.isDirectory) {
        let reader = entry.createReader();
        let entries = await new Promise((resolve, reject) => {
            reader.readEntries(resolve, reject);
        });
        for (let subEntry of entries) {
            files = files.concat(await traverseFileTree(subEntry));
        }
    }
    return files;
}

async function getFile(fileEntry) {
    return new Promise((resolve, reject) => {
        fileEntry.file(resolve, reject);
    });
}


function refreshSeries(){
    let selectElement = $("#seriesSelect")[0]
    selectElement.innerHTML = "";
    let newHtml = "";
    for (let series in images) {
        newHtml += `<option value="${series}" ${(currentSeries==series)?'selected':''}>${series}</option>`;
    }
    selectElement.innerHTML = newHtml;
}

function setNewSeries(seriesId){
    currentSeries = seriesId;
    loadSeries(seriesId);
}

function loadSeries(seriesId){

    if (images[seriesId].length > 0) {
        dumpFile(images[seriesId][0].file);
        loadAndViewImage(images[seriesId][0]);
    }
    
    let totalLength = images[seriesId].length;
    totalSliceElement.innerHTML = totalLength;
    imageSlider.attr("max", totalLength);
    imageSlider.val("1");
    currentSliceElement.innerHTML = "1"; 
    
    if (images[seriesId].length > 1) {
        $($("#slider-div")[0]).attr("style", false);
    }else{
        $($("#slider-div")[0]).attr("style", "display: none;");
    }

    $($("#seriesSelect")[0]).attr("style", "");
}


function filterDetails(tag, value, metaDetails){
    if(tag in TAG_DETAILS_MAPPING && TAG_DETAILS_MAPPING[tag]){
        metaDetails[TAG_DETAILS_MAPPING[tag]] = value;
    }
}


async function dumpFile(file, writeHtml=true) {
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
        instanceId: "",
        seriesId: "",
        studyId: "",
        patientName: "",
        patientAge: "",
        manufacturer: "",
        seriesDescription: "",
        frames: "1"
    }

    dumpDataSet(dataSet, output, metaDetails);

    if(writeHtml){
        document.getElementById('dropZone').innerHTML = output.join('');
        showCopyIcon();
    }
    return metaDetails;
}

function dumpDataSet(dataSet, output, metaDetails) {
        
    try {
        output.push(`<table class="table table-striped">
            <thead>
                <tr>
                    <th>Tag</th>
                    <th>Name</th>
                    <th>Length</th>
                    <th>VR</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>`)
        for (var propertyName in dataSet.elements) {
            if(propertyName === 'xfffee00d') {
                continue;
            }
            var text = "<tr>"
            var element = dataSet.elements[propertyName];

            var tagData = formatDicomTag(element.tag);

            text += "<td show='copy'>" + tagData[0] + "</td>";
            text += "<td show='copy'>" + tagData[1] + "</td>";

            if (element.hadUndefinedLength) {
                text += "<td>(-1)</td>";
            }else{
                text += "<td>" + element.length + "</td>";
            }

            if (element.vr) {
                text += "<td>" + element.vr + "</td>";
            }

            var color = 'black';
            text += "<td show='copy'>"
            if (element.items) {
                output.push(text);
                var itemNumber = 0;
                element.items.forEach(function (item) {
                    
                    var itemsHTML = [];
                    let newMetaDetails = {};
                    dumpDataSet(item.dataSet, itemsHTML, newMetaDetails);
                    var formattedItemTag = formatDicomTag(item.tag);

                    var uuid = generateUUID();
                    modalData[uuid] = {
                        html: itemsHTML.join(''),
                        originalTagData: tagData,
                        baseTagData: formattedItemTag,
                        itemNumber: itemNumber
                    };
                    
                    output.push('<p class="pointer" onclick="openModal(`'+ uuid +'`)">SEQ #' + itemNumber++ + ' ' + `${formattedItemTag[0]}` + '</p>')
                });
            }
            else if (element.fragments) {
                output.push('' + text);
                var itemNumber = 0;
                element.fragments.forEach(function (fragment) {
                    var basicOffset;
                    if(element.basicOffsetTable) {
                        basicOffset = element.basicOffsetTable[itemNumber];
                    }

                    var str = 'Fragment #' + itemNumber++ + ' offset = ' + fragment.offset;
                    str += '(' + basicOffset + ')';
                    str += '; length = ' + fragment.length + '';
                    output.push(str);
                });
            }
            else {
                if (element.length < 128) {
                    var numberValue = 0;
                    if (element.length === 2) {
                        numberValue = dataSet.uint16(propertyName);
                        text += numberValue;
                    }
                    else if (element.length === 4) {
                        numberValue = dataSet.uint32(propertyName);
                        text += numberValue;
                    }

                    var str = dataSet.string(propertyName);
                    var stringIsAscii = isASCII(str);

                    if (stringIsAscii) {
                        if (str !== undefined) {
                            if(numberValue !== 0) {
                                text += ' - ';
                            }
                            text += '"' + str + '"';
                            filterDetails(tagData[0], str, metaDetails);
                        }
                    }

                    
                    else {
                        if (element.length !== 2 && element.length !== 4) {
                            color = '#C8C8C8';
                            text += "binary data";
                        }
                    }

                    if (element.length === 0) {
                        color = '#C8C8C8';
                    }

                }
                else {
                    color = '#C8C8C8';
                    text += "data too long to show";
                }

                output.push(text);

            }
            text += "</td>"
            text += "</tr>"
        }

        output.push('</tbody></table>')
    } catch(err) {
        var ex = {
            exception: err,
            output: output
        }
        throw ex;
    }
}

function formatDicomTag(tag) {
    const cleanedTag = tag.startsWith('x') ? tag.slice(1) : tag;
    const group = cleanedTag.slice(0, 4).toUpperCase();
    const element = cleanedTag.slice(4).toUpperCase();
    const tagFormatted = `(${group},${element})`;
    return [tagFormatted, DicomTags[tagFormatted] ?? 'Private Tag'];
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

openModal = function(uuid) {
    var modalContent = document.getElementById('modalContent');
    var sequenceContent = modalData[uuid];
    modalContent.innerHTML = sequenceContent.html;
    $('#modal-title')[0].innerHTML = `Sequence #${sequenceContent.itemNumber} - ${sequenceContent.originalTagData.join(" - ")}`;
    showCopyIcon();
    myModal.show();
}

async function setImage(index){
    let image = images[currentSeries][index]
    loadAndViewImage(image);
    await dumpFile(image.file);
}

async function onSliderChange(event){
    let value = imageSlider.val();
    currentSliceElement.innerHTML = value;

    let newIndex = value - 1;
    await setImage(newIndex);
}

function sliderLeft(){
    if(parseInt(imageSlider.val()) > 1){
        imageSlider.val(parseInt(imageSlider[0].value) - 1);
        onSliderChange("input");
    }
}

function SliderRight(){
    if(parseInt(imageSlider.val()) < parseInt(totalSliceElement.innerHTML)){
        imageSlider.val(parseInt(imageSlider[0].value) + 1);
        onSliderChange("input");
    }
}




window.onload = function(){
    // Setup the dnd listeners.
    var body = document.getElementsByTagName('body')[0];
    body.addEventListener('dragover', handleDragOver, false);
    body.addEventListener('drop', handleFileSelect, false);


    imageSlider.on("input", onSliderChange);

    // dicomImage on mousewheel call sliderLeft or SliderRight
    dicomImage.addEventListener('wheel', function(e){
        if(e.deltaY > 0){
            sliderLeft();
        }else{
            SliderRight();
        }
    });


    // document on arrow up or down pressed change series from select series and trigger change event
    document.onkeydown = function(e) {
        let seriesSelect = $("#seriesSelect")[0];
        let selectedIndex = seriesSelect.selectedIndex;
        switch (e.keyCode) {
            case 38:
                if(selectedIndex > 0){
                    seriesSelect.selectedIndex = selectedIndex - 1;
                    setNewSeries(seriesSelect.value);
                }
                break;
            case 40:
                // down arrow
                if(selectedIndex < seriesSelect.length - 1){
                    seriesSelect.selectedIndex = selectedIndex + 1;
                    setNewSeries(seriesSelect.value);
                }
                break;
            case 37:
                if(parseInt(imageSlider.val()) > 1){
                    imageSlider.val(parseInt(imageSlider[0].value) - 1);
                    onSliderChange("input");
                }
                break;
            case 39:
                if(parseInt(imageSlider.val()) < parseInt(totalSliceElement.innerHTML)){
                    imageSlider.val(parseInt(imageSlider[0].value) + 1);
                    onSliderChange("input");
                }
                break;
        }
    };
    
}
