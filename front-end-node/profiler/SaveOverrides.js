/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/
    
WebInspector.CPUProfileHeader.prototype.saveToFile = WebInspector.HeapProfileHeader.prototype.saveToFile = function()
{
    var self = this;
    self._fileName = self._fileName || new Date().toISO8601Compact() + self._profileType.fileExtension();
    if (self._tempFile == null) {
        self._oldOnTempFileReady = self._onTempFileReady;
        self._onTempFileReady = function(){
            self._tempFile.read(function(data){
                saveAs(new Blob([data], {type: "application/octet-stream"}),self._fileName);
            });
            self._onTempFileReady = self._oldOnTempFileReady;
            if (self._onTempFileReady) {
                self._onTempFileReady();
                self._onTempFileReady = null;
            }
        };
    } else {
        self._tempFile.read(function(data){
            saveAs(new Blob([data], {type: "application/octet-stream"}),self._fileName);
        });
    }
}
