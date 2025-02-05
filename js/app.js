cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.init({
    mouseEnabled: true,
    touchEnabled: true,
    globalToolSyncEnabled: true,
    showSVGCursors: true,
  });

let modalData = {};
let images = {};
let currentSeries = "";
let clipboardHistory = {};
let seriesSlicePosition = {};
let showSHA1 = false;
let studyMapping = {};
let movieInterval = null;
let viewport = {};
let metaDetails = {};

let myModal = new bootstrap.Modal(document.getElementById('myModal'));
let element = document.getElementById('dicomImage');
cornerstone.enable(element);
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

function isASCII(str) {
    return /^[\x00-\x7F]*$/.test(str);
}

function sha1(byteArray, position, length) {
    position = position || 0;
    length = length || byteArray.length;
    let subArray = dicomParser.sharedCopy(byteArray, position, length);
    return rusha.digest(subArray);
}

function sha1Text(byteArray, position, length) {
    if(showSHA1 === false) {
        return "";
    }
    let text = "; SHA1 " + sha1(byteArray, position, length);
    return text;
}

function mapUid(str) {
    let uid = uids[str];
    if(uid) {
        return ' [ ' + uid + ' ]';
    }
    return '';
}

function escapeSpecialCharacters(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dataDownloadLink(element, text) {
    let linkText = "<a class='dataDownload' href='#' data-tag='" + element.tag + "'";
        linkText += " data-dataOffset='" + element.dataOffset + "'";
        linkText += " data-length='" + element.length + "'";
        linkText += ">" + text + "</a>";
    return linkText;
}



function enableTool(toolName, mouseButtonMask) {
    const apiTool = cornerstoneTools[`${toolName}Tool`];
    cornerstoneTools.addTool(apiTool);
    cornerstoneTools.setToolActive(toolName, { mouseButtonMask: mouseButtonMask });
}

function loadDicomInfo(){
    let viewPort = cornerstone.getViewport(element);
    let windowWidth = parseFloat(viewPort.voi.windowWidth.toFixed(2));
    let windowCenter = parseFloat(viewPort.voi.windowCenter.toFixed(2));
    $('#dicomInfo')[0].innerHTML = `
    <p>${metaDetails.patientName}</p>
    <p>${metaDetails.patientAge}</p>
    <p>${metaDetails.manufacturer}</p>
    <p>${metaDetails.seriesDescription}</p>
    <p>WW:${windowWidth} WC:${windowCenter}</p>
    `;
}

function loadAndViewImage(imageData) {
    let imageId = imageData.wadouri;
    cornerstone.loadImage(imageId).then(function(image) {
        if(!(currentSeries in viewport)){
            viewport[currentSeries] = cornerstone.getDefaultViewportForImage(element, image);
        }
        cornerstone.displayImage(element, image);
        cornerstone.setViewport(element, viewport[currentSeries])
        metaDetails = imageData.metaDetails;
        loadDicomInfo();
        if(!loaded){
            enableTool('Wwwc', 1);
            enableTool('Pan', 4);
            enableTool('Zoom', 2);
            enableTool('OrientationMarkers', 0);
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

function showNotification(message, autoHide = true) {
    toastBootstrap._config.autohide = autoHide;
    $('[data-bs-dismiss="toast"]')[0].style.display = !autoHide ? "none" : "";
    toastMessage.innerHTML = message;
    toastBootstrap.show();
}

function downloadData(data, fileName) {
    let blob = new Blob([data], {type: 'application/octet-stream'});
    let objectURL = URL.createObjectURL(blob);
    let a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    a.href = objectURL;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(objectURL);
    $(a).remove();
}


async function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    let start = performance.now();
    let currentNoOfSeries = Object.keys(images).length;
    let currentNoOfStudies = Object.keys(studyMapping).length;
    showNotification(`<div class="spinner-border text-secondary" role="status"></div><span style="top: -8px;left: 15px;position: relative;">Loading Files. Please wait...</span>`, false);

    let items = evt.dataTransfer.items;
    let files = [];

    if (items) {
        // Collect all file/folder traversal promises
        let traversePromises = [];

        for (let item of items) {
            if (item.kind === "file") {
                let entry = item.webkitGetAsEntry();
                if (entry) {
                    traversePromises.push(traverseFileTree(entry));
                }
            }
        }

        // Wait for all files/folders to be processed
        let results = await Promise.all(traversePromises);

        // Flatten the results array
        files = results.flat();
    } else {
        files = Array.from(evt.dataTransfer.files);
    }

    // Check for ZIP files and process them if any
    let zipFiles = files.filter(file => file.name.endsWith('.zip'));

    if (zipFiles.length > 0) {
        showNotification(`<div class="spinner-border text-secondary" role="status"></div><span style="top: -8px;left: 15px;position: relative;">Unzipping Files. Please wait...</span>`, false);
        for (let zipFile of zipFiles) {
            let unzippedFiles = await handleZipFile(zipFile);
            files = files.concat(unzippedFiles);
        }
    }

    // Continue with the existing processing logic for all files
    let processingPromises = [];

    for (let file of files) {
        processingPromises.push(processFile(file));
    }

    // Wait for all files to be processed
    await Promise.all(processingPromises);

    for (let series in images) {
        images[series].sort((a, b) => a.instanceNumber - b.instanceNumber);
    }

    loadSeries(currentSeries);
    refreshSeries();
    let end = performance.now();
    showNotification(`${Object.keys(studyMapping).length - currentNoOfStudies} studies and ${Object.keys(images).length - currentNoOfSeries} series loaded in ${((end - start) / 1000).toFixed(2)} seconds`);
}

async function handleZipFile(zipFile) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = async function (e) {
            try {
                // Use JSZip to unzip the file
                let zip = await JSZip.loadAsync(e.target.result);
                let fileNames = Object.keys(zip.files);
                let unzippedFiles = [];

                for (let fileName of fileNames) {
                    let file = zip.files[fileName];

                    if (!file.dir) {
                        let fileBlob = await file.async('blob');
                        unzippedFiles.push(new File([fileBlob], fileName));
                    }
                }

                resolve(unzippedFiles);
            } catch (error) {
                console.error("Error unzipping file:", error);
                reject(error);
            }
        };
        reader.onerror = function (error) {
            reject(error);
        };
        reader.readAsArrayBuffer(zipFile);
    });
}


async function processFile(file) {
    try {
        let metaDetails = await dumpFile(file, false);
        let frames = parseInt(metaDetails.frames);
        let wadouri = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);

        if (!(metaDetails.seriesId in images)) {
            images[metaDetails.seriesId] = [];
            seriesSlicePosition[metaDetails.seriesId] = 0;
        }

        if(!(metaDetails.studyId in studyMapping)){
            studyMapping[metaDetails.studyId] = {
                patientInfo: `${metaDetails.patientName} - ${metaDetails.patientAge}`,
                series: []
            };
        }

        if(!studyMapping[metaDetails.studyId].series.includes(metaDetails.seriesId)){
            studyMapping[metaDetails.studyId].series.push(metaDetails.seriesId);
        }

        if (loaded || (!loaded && currentSeries === "")) {
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
    } catch (e) {
        console.log("Error processing file", e);
    }
}

async function traverseFileTree(entry) {
    let files = [];
    if (entry.isFile) {
        files.push(await getFile(entry));
    } else if (entry.isDirectory) {
        let reader = entry.createReader();
        let entries = [];

        // Read all entries in batches (fixes 100-file limit)
        let readEntries = async () => {
            let batch = await new Promise((resolve, reject) => {
                reader.readEntries(resolve, reject);
            });

            if (batch.length > 0) {
                entries = entries.concat(batch);
                await readEntries(); // Recursively read until empty batch
            }
        };

        await readEntries(); // Start recursive reading

        // Recursively process each entry
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
    for (let study in studyMapping){
        newHtml += `<optgroup label="${studyMapping[study].patientInfo} - ${study}">`;
        for (let series of studyMapping[study].series){
            newHtml += `<option value="${series}" ${(currentSeries==series)?'selected':''}>${images[series][0].metaDetails.seriesDescription} - ${series}</option>`;
        }
        newHtml += `</optgroup>`;
    }
    selectElement.innerHTML = newHtml;
}

function setNewSeries(seriesId){
    stopMovie();
    currentSeries = seriesId;
    loadSeries(seriesId);
}

function loadSeries(seriesId){

    if (images[seriesId].length > 0) {
        let currentSlicePosition = seriesSlicePosition[seriesId];
        dumpFile(images[seriesId][currentSlicePosition].file);
        if(!loaded){
            $('#seriesSelect').select2();
        }
        loadAndViewImage(images[seriesId][currentSlicePosition]);
        let totalLength = images[seriesId].length;
        totalSliceElement.innerHTML = totalLength;
        imageSlider.attr("max", totalLength);
        imageSlider.val(currentSlicePosition + 1);
        currentSliceElement.innerHTML = currentSlicePosition + 1; 
        
        if (images[seriesId].length > 1) {
            $(".slider-div").attr("style", false);
        }else{
            $(".slider-div").attr("style", "display: none;");
        }

        $($("#seriesSelect")[0]).attr("style", "");
    }
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
        performSearch($("#searchInput")[0].value);
    }
    return metaDetails;
}

function isStringVr(vr) {
    return !['AT', 'FL', 'FD', 'OB', 'OF', 'OW', 'SI', 'SQ', 'SS', 'UL', 'US'].includes(vr);
}

function dumpDataSet(dataSet, output, metaDetails) {
        
    try {
        output.push(`<table class="table table-striped">
            <thead>
                <tr>
                    <th class="col-md-1">Tag</th>
                    <th class="col-md-4">Name</th>
                    <th class="col-md-1">Length</th>
                    <th class="col-md-1">VR</th>
                    <th class="col-md-1">VM</th>
                    <th class="col-md-5">Value</th>
                </tr>
            </thead>
            <tbody>`)
        for (let propertyName in dataSet.elements) {
            if(propertyName === 'xfffee00d') {
                continue;
            }
            let text = "<tr>"
            let element = dataSet.elements[propertyName];

            let tagData = formatDicomTag(element.tag);

            text += "<td show='copy'>" + tagData[0] + "</td>";
            text += "<td show='copy'>" + tagData[1] + "</td>";

            if (element.hadUndefinedLength) {
                text += "<td>(-1)</td>";
            }else{
                text += "<td>" + element.length + "</td>";
            }

            if(!element.vr){
                element.vr = DicomTags[tagData[0]]?.vr;
            }

            if (element.vr) {
                text += "<td>" + element.vr + "</td>";
            }

            text += "<td>" + DicomTags[tagData[0]]?.vm?.toUpperCase() + "</td>";

            text += "<td show='copy'>"
            if (element.items) {
                output.push(text);
                let itemNumber = 0;
                element.items.forEach(function (item) {
                    
                    let itemsHTML = [];
                    let newMetaDetails = {};
                    dumpDataSet(item.dataSet, itemsHTML, newMetaDetails);
                    let formattedItemTag = formatDicomTag(item.tag);

                    let uuid = generateUUID();
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
                let itemNumber = 0;
                element.fragments.forEach(function (fragment) {
                    let basicOffset;
                    if(element.basicOffsetTable) {
                        basicOffset = element.basicOffsetTable[itemNumber];
                    }

                    let str = 'Fragment #' + itemNumber++ + ' offset = ' + fragment.offset;
                    str += '(' + basicOffset + ')';
                    str += '; length = ' + fragment.length + '';
                    output.push(str);
                });
            }
            else {
                let vr = element.vr;
                let tag = element.tag;
                if (element.length < 128) {
                    if (element.vr === undefined && tag === undefined) {
                        if (element.length === 2) {
                            text += dataSet.uint16(propertyName);
                        }
                        else if (element.length === 4) {
                            text += dataSet.uint32(propertyName);
                        }


                        // Next we ask the dataset to give us the element's data in string form.  Most elements are
                        // strings but some aren't so we do a quick check to make sure it actually has all ascii
                        // characters so we know it is reasonable to display it.
                        let str = dataSet.string(propertyName);
                        let stringIsAscii = isASCII(str);

                        if (stringIsAscii) {
                            // the string will be undefined if the element is present but has no data
                            // (i.e. attribute is of type 2 or 3 ) so we only display the string if it has
                            // data.  Note that the length of the element will be 0 to indicate "no data"
                            // so we don't put anything here for the value in that case.
                            if (str !== undefined) {
                                text += '"' + escapeSpecialCharacters(str) + '"' + mapUid(str);
                            }
                        }
                        else if (element.length !== 2 && element.length !== 4) {
                            // If it is some other length and we have no string
                            text += "binary data";
                        }
                        
                    }
                    else {
                        if (isStringVr(vr)) {
                            // Next we ask the dataset to give us the element's data in string form.  Most elements are
                            // strings but some aren't so we do a quick check to make sure it actually has all ascii
                            // characters so we know it is reasonable to display it.
                            let str = dataSet.string(propertyName);
                            let stringIsAscii = isASCII(str);

                            if (stringIsAscii) {
                                // the string will be undefined if the element is present but has no data
                                // (i.e. attribute is of type 2 or 3 ) so we only display the string if it has
                                // data.  Note that the length of the element will be 0 to indicate "no data"
                                // so we don't put anything here for the value in that case.
                                if (str !== undefined) {
                                    text += '"' + escapeSpecialCharacters(str) + '"' + mapUid(str);
                                }

                                filterDetails(tagData[0], str, metaDetails);
                            }
                            else {
                                if (element.length !== 2 && element.length !== 4) {
                                    // If it is some other length and we have no string
                                    text += "binary data";
                                }
                            }
                        }
                        else if (vr === 'US') {
                            text += dataSet.uint16(propertyName);
                            for(let i=1; i < dataSet.elements[propertyName].length/2; i++) {
                                text += '\\' + dataSet.uint16(propertyName, i);
                            }
                        }
                        else if (vr === 'SS') {
                            text += dataSet.int16(propertyName);
                            for(let i=1; i < dataSet.elements[propertyName].length/2; i++) {
                                text += '\\' + dataSet.int16(propertyName, i);
                            }
                        }
                        else if (vr === 'UL') {
                            text += dataSet.uint32(propertyName);
                            for(let i=1; i < dataSet.elements[propertyName].length/4; i++) {
                                text += '\\' + dataSet.uint32(propertyName, i);
                            }
                        }
                        else if (vr === 'SL') {
                            text += dataSet.int32(propertyName);
                            for(let i=1; i < dataSet.elements[propertyName].length/4; i++) {
                                text += '\\' + dataSet.int32(propertyName, i);
                            }
                        }
                        else if (vr == 'FD') {
                            text += dataSet.double(propertyName);
                            for(let i=1; i < dataSet.elements[propertyName].length/8; i++) {
                                text += '\\' + dataSet.double(propertyName, i);
                            }
                        }
                        else if (vr == 'FL') {
                            text += dataSet.float(propertyName);
                            for(let i=1; i < dataSet.elements[propertyName].length/4; i++) {
                                text += '\\' + dataSet.float(propertyName, i);
                            }
                        }
                        else if (vr === 'OB' || vr === 'OW' || vr === 'UN' || vr === 'OF' || vr === 'UT') {
                            // If it is some other length and we have no string
                            if(element.length === 2) {
                                text += dataDownloadLink(element, "binary data") + " of length " + element.length + " as uint16: " +dataSet.uint16(propertyName);
                            } else if(element.length === 4) {
                                text += dataDownloadLink(element, "binary data") + " of length " + element.length + " as uint32: " +dataSet.uint32(propertyName);
                            } else {
                                text += dataDownloadLink(element, "binary data") + " of length " + element.length + " and VR " + vr ;
                            }
                        }
                        else if(vr === 'AT') {
                            let group = dataSet.uint16(propertyName, 0);
                            let groupHexStr = ("0000" + group.toString(16)).substr(-4);
                            let atElement = dataSet.uint16(propertyName, 1);
                            let elementHexStr = ("0000" + atElement.toString(16)).substr(-4);
                            text += "x" + groupHexStr + elementHexStr;
                        }
                    }
                }
                else {
                    if (tagData[0] === "(0042,0011)") {
                        let pdfBlob = new Blob([dataSet.byteArray.slice(element.dataOffset, element.dataOffset + element.length)], { type: 'application/pdf' });
                        let pdfUrl = URL.createObjectURL(pdfBlob);
                        let modalHtml = `<iframe style="width:100%;height:80vh" src="${pdfUrl}#zoom=100"></iframe>`;

                        let uuid = generateUUID();
                        modalData[uuid] = {
                            html: modalHtml,
                            originalTagData: tagData,
                            baseTagData: tagData,
                            itemNumber: 0
                        };

                        text+= `<p class="pointer" onclick="openModal('`+ uuid +`')">View Document</p>`
                    }else{
                        text += dataDownloadLink(element, "data");
                        text += " of length " + element.length + " for VR " + vr + " too long to show";
                        text += sha1Text(dataSet.byteArray, element.dataOffset, element.length);
                    }
                }

                output.push(text);

            }
            text += "</td>"
            text += "</tr>"
        }

        output.push('</tbody></table>')
    } catch(err) {
        let ex = {
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
    return [tagFormatted, DicomTags[tagFormatted]?.name ?? 'Private Tag'];
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
    let value = clipboardHistory[uuid];
    navigator.clipboard.writeText(value);
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

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function () {
            resolve(reader.result);
        };

        reader.onerror = function (error) {
            reject(error);
        };

        reader.readAsArrayBuffer(file);
    });
}

let openModal = function(uuid) {
    let modalContent = document.getElementById('modalContent');
    let sequenceContent = modalData[uuid];
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
    seriesSlicePosition[currentSeries] = newIndex;
    await setImage(newIndex);
}

function sliderLeft(){
    stopMovie();
    if(parseInt(imageSlider.val()) > 1){
        imageSlider.val(parseInt(imageSlider[0].value) - 1);
        onSliderChange("input");
    }
}

function SliderRight(){
    stopMovie()
    if(parseInt(imageSlider.val()) < parseInt(totalSliceElement.innerHTML)){
        imageSlider.val(parseInt(imageSlider[0].value) + 1);
        onSliderChange("input");
    }
}

function toggleDarkMode(){
    let html = $('html')[0];
    let darkMode = html.getAttribute("data-bs-theme") === "dark";
    html.setAttribute("data-bs-theme", darkMode ? "light" : "dark");
}

function stopMovie() {
    if(movieInterval){
        clearInterval(movieInterval);
        movieInterval = null;
        let icon = $('#movieControlIcon')[0];
        icon.setAttribute('class', "bi bi-play-fill");
    }
    
}

function playAsMovie(){
    
    let slider = imageSlider[0];
    if(parseInt(totalSliceElement.innerHTML) > 2){
        let icon = $('#movieControlIcon')[0];
        icon.setAttribute('class', "bi bi-pause-fill");
        movieInterval = setInterval(() => {
            if (parseInt(slider.value) < parseInt(totalSliceElement.innerHTML)) {
                slider.value = parseInt(slider.value) + 1;
                imageSlider.trigger("input");
            } else {
                slider.value = 1;
                imageSlider.trigger("input");
            }
        }, 1000 / 30);

    }
    
     
}

function toggleMoviePlayback(){
    if (movieInterval) {
        stopMovie();
    } else {
        playAsMovie();
    }
}

function onImageRendered() {
    loadDicomInfo();
}




window.onload = function(){
    // Setup the dnd listeners.
    let body = document.getElementsByTagName('body')[0];
    body.addEventListener('dragover', handleDragOver, false);
    body.addEventListener('drop', handleFileSelect, false);

    imageSlider.on("input", onSliderChange);

    // dicomImage on mousewheel call sliderLeft or SliderRight
    element.addEventListener('wheel', function(e){
        if(e.deltaY > 0){
            SliderRight();
        }else{
            sliderLeft();
        }
    });

    element.addEventListener(cornerstone.EVENTS.IMAGE_RENDERED, onImageRendered)


    // document on arrow up or down pressed change series from select series and trigger change event
    document.onkeydown = function(e) {

        e.preventDefault();
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            $("#searchInput")[0].focus();
            return;
        }

        if (event.code === 'Space' && !['INPUT','TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) {  
            toggleMoviePlayback();
            return;
        }

        let seriesSelect = $("#seriesSelect"); // Select2 element
    
        let options = seriesSelect.find("option");
        let selectedIndex = options.index(options.filter(":selected"));
        switch (e.key) {
            case 'ArrowUp': // Move up in the dropdown
                seriesSelect.select2("close"); // Close the Select2 dropdown
                imageSlider.blur();
                if (selectedIndex > 0) {
                    let newValue = options.eq(selectedIndex - 1).val();
                    seriesSelect.val(newValue).trigger("change");
                    setNewSeries(newValue);
                }
                break;
    
            case 'ArrowDown': // Move down in the dropdown
                seriesSelect.select2("close");
                imageSlider.blur();
                if (selectedIndex < options.length - 1) {
                    let newValue = options.eq(selectedIndex + 1).val();
                    seriesSelect.val(newValue).trigger("change");
                    setNewSeries(newValue);
                }
                break;
            case 'ArrowLeft':
                imageSlider.blur();
                if(parseInt(imageSlider.val()) > 1){
                    imageSlider.val(parseInt(imageSlider[0].value) - 1);
                    onSliderChange("input");
                }
                break;
            case 'ArrowRight':
                imageSlider.blur();
                if(parseInt(imageSlider.val()) < parseInt(totalSliceElement.innerHTML)){
                    imageSlider.val(parseInt(imageSlider[0].value) + 1);
                    onSliderChange("input");
                }
                break;
        }
    };

    $("#searchInput")[0].focus();
    
}