/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //
// Global
window.Flashbug = {
	SWF_MIME: "application/shockwave-flash",
	XSWF_MIME: "application/x-shockwave-flash",
	XSPL_MIME: "application/x-futuresplash",
	SPL_MIME: "application/futuresplash",
	AMF_MIME: "application/x-amf"
};

var extensionName = "flashbug"; 

// ********************************************************************************************* //
// Initialization

var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH) FBTrace.sysout('FlashbugMainOverlay - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('ERROR ' + e);
	};

var config = Firebug.getModuleLoaderConfig();
config.paths[extensionName] = extensionName + "/content";

// Load main.js module (the entry point of the extension) and support for tracing.
Firebug.require(config, [
    extensionName + "/main",
    "firebug/lib/trace"
],
function(Extension, FBTrace) {
	
	// ********************************************************************************************* //
	// Initialize
	
    try {
        Extension.initialize();

        function onUnload() {
            window.removeEventListener("unload", onUnload, false);
            onShutdown(Extension);
        };

        window.addEventListener("unload", onUnload, false);
    } catch (e) {
        ERROR(e);
    }
});

// ********************************************************************************************* //
// Shutdown

function onShutdown(Extension) {
    try {
        Extension.shutdown();
    } catch (e) {
		ERROR(e);
    }
}

// ********************************************************************************************* //
})();
