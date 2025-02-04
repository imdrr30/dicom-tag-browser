if ("launchQueue" in window) {
  launchQueue.setConsumer(async (launchParams) => {
    let inputFiles = [];
    for (const file of launchParams.files) {
      inputFiles.push(await file.getFile());
    }
    if(inputFiles.length>0){
      let event = {
        dataTransfer: {
          items: false,
          files: inputFiles,
        },
        stopPropagation: ()=> {},
        preventDefault: ()=> {},
      }
      await handleFileSelect(event);
    }
  });
}