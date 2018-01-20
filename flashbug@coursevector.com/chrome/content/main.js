/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/trace/traceModule",
    "firebug/trace/traceListener",
	"firebug/net/netUtils",
	"flashbug/lib/io",
	"flashbug/consoleModule",
    "flashbug/consolePanel",
	"flashbug/sharedObjectModule",
    "flashbug/sharedObjectPanel",
	"flashbug/amfModule",
	"flashbug/decompileModule",
    "flashbug/decompilePanel",
	"flashbug/decompileTreeModule",
    "flashbug/decompileTreePanel"
],
function(FBTrace, TraceModule, TraceListener, NetUtils, IO, ConsoleModule, ConsolePanel, SharedObjectModule, SharedObjectPanel) {
	
var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH) FBTrace.sysout('FlashbugMain - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('ERROR ' + e);
	};

// ********************************************************************************************* //
// The application/extension object

// Add flash mime types
try {
	NetUtils.mimeCategoryMap[Flashbug.AMF_MIME] = "flash";
	NetUtils.mimeCategoryMap[Flashbug.SWF_MIME] = "flash";
	NetUtils.mimeCategoryMap[Flashbug.XSWF_MIME] = "flash";
	NetUtils.mimeCategoryMap[Flashbug.SPL_MIME] = "flash";
	NetUtils.mimeCategoryMap[Flashbug.XSPL_MIME] = "flash";
} catch (e) {
	ERROR(e);
}

Firebug.registerStringBundle("chrome://flashbug/locale/flashbug.properties");

var theApp = {
    initialize: function() {
		// Style traces
        this.traceListener = new TraceListener("flashbug;", "DBG_FLASH", true, "resource://flashbug/skin/classic/flashbug.css");
        TraceModule.addListener(this.traceListener);
		
		Firebug.registerStylesheet("resource://flashbug/skin/classic/flashbug.css");
		
		Firebug.registerRep(
			ConsoleModule.XMLErrorRep,
			ConsoleModule.BodyRep,
			SharedObjectModule.TableRep,          // Cookie table with list of cookies
			SharedObjectModule.RowRep             // Entry in the cookie table
		);
		
		Firebug.registerActivableModule(ConsoleModule);
		Firebug.registerPanel(ConsolePanel);
		
		Firebug.registerActivableModule(SharedObjectModule);
		Firebug.registerPanel(SharedObjectPanel);
    },
	
	internationalizeUI: function(doc) {
		var elements = Arr.cloneArray(doc.getElementsByClassName("fbInternational"));
        Locale.internationalizeElements(doc, elements, ["label", "tooltiptext", "value"]);
    },

    shutdown: function() {
        trace("Flashbug extension shutdown");

        // TODO: Extension shutdown
		//Firebug.unregisterPanel(MyPanel);
		Firebug.unregisterPanel(ConsolePanel);

        TraceModule.removeListener(this.traceListener);
    }
}

return theApp;

// ********************************************************************************************* //
});