/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
	"firebug/lib/dom",
	"firebug/lib/domplate",
	"firebug/lib/css",
	"firebug/lib/options",
	"firebug/lib/locale",
	"firebug/lib/trace",
	"firebug/lib/xpcom",
	"firebug/lib/http",
	"flashbug/lib/io"
],
function(Obj, Dom, Domplate, Css, Options, Locale, FBTrace, Xpcom, Http, IO) {
	
// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

Locale.registerStringBundle("chrome://flashbug/locale/flashbug.properties");

// ********************************************************************************************* //
// Custom Module Implementation

var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH_AMF) FBTrace.sysout('flashbug; AMFModule - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('flashbug; ERROR ' + e);
	};
	
Flashbug.AMFInfoModule = Obj.extend(Firebug.Module, {
	
	tabId1: "AMFPost",
	tabId2: "AMFResponse",
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends Module
	
	dispatchName: "AMFInfo",
	
    initialize: function() {
		trace("initialize");
		
		Firebug.Module.initialize.apply(this, arguments);
		
		// Add AMF as a cached content type
		var cachedTypes = Firebug.getPref(Firebug.prefDomain, "cache.mimeTypes");
		if(cachedTypes && cachedTypes.indexOf(Flashbug.AMF_MIME) == -1) {
			if(cachedTypes.length > 0) cachedTypes += " ";
			cachedTypes += Flashbug.AMF_MIME;
		Firebug.getPref(Firebug.prefDomain, "cache.mimeTypes", cachedTypes);
		}
		
		// Register NetInfoBody listener
        Firebug.NetMonitor.NetInfoBody.addListener(this);
		
		// Register cache listener
		Firebug.TabCacheModel.addListener(this);
    },
	
    shutdown: function() {
		trace("shutdown");
		
		Firebug.Module.shutdown.apply(this, arguments);
		
		// Unregister NetInfoBody listener
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
		
		// Unregister cache listener
		Firebug.TabCacheModel.removeListener(this);
    },
	
	showPanel: function(browser, panel) {
		//
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends CacheListener
	
	shouldCacheRequest: function(request) {
		return this.isAMF(Http.safeGetContentType(request));
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends NetInfoBody
	
    initTabBody: function(infoBox, file) {
          var request = file.request || file;
		//trace("initTabBody", file);
		if (this.isAMF(Http.safeGetContentType(request))) {
			Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, this.tabId1, Locale.$STR("flashbug.netInfoAMF.requestTitle"));
			Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, this.tabId2, Locale.$STR("flashbug.netInfoAMF.responseTitle"));
		}
	},
	
    destroyTabBody: function(infoBox, file) {},
	
    updateTabBody: function(infoBox, file, context) {
		//trace("updateTabBody", file);
		
		// Get currently selected tab.
		var tab = infoBox.selectedTab;
		
		// Generate content only for the first time; and only if our tab has been just activated.
		if (tab.dataPresented || (!Css.hasClass(tab, "netInfo" + this.tabId1 + "Tab") && !Css.hasClass(tab, "netInfo" + this.tabId2 + "Tab"))) return;
		
		// Make sure the content is generated just once.
		tab.dataPresented = true;
		
		// Get body element associated with the tab.
		var isPostTab = Css.hasClass(tab, "netInfo" + this.tabId1 + "Tab");
		var tabBody = isPostTab ? getElementByClass(infoBox, "netInfo" + this.tabId1 + "Text") : getElementByClass(infoBox, "netInfo" + this.tabId2 + "Text");
		
		if(isPostTab) {
			// Create container html
			tabBody = Flashbug.AMFInfoModule.NetInfoRep.post.replace({}, tabBody);
			
			// Request
			if(!file.requestAMF) {
				if (file.postText) {
					var worker = new Worker("chrome://flashbug/content/amf/amfWorker.js");
					var t = this;
					worker.onmessage = function(event) {
						if (event.data && event.data.type && event.data.type == 'debug') {
							var arr = event.data.message,
								title = arr.shift();
							trace('Worker trace - ' + title, arr);
						} else {
							trace("Worker post complete", event.data);
						
							file.requestAMF = event.data;
							Firebug.DOMPanel.DirTable.tag.replace({object: file.requestAMF, toggles: t.toggles}, Dom.getChildByClass(tabBody, "flashbugAMFRequest"));
						}
					};
					worker.onerror = function(error) {
						trace("Worker error post: " + error.message, error);
						Flashbug.AMFInfoModule.NetInfoRep.error.replace({message:Locale.$STR("flashbug.netInfoAMF.error.parse") + ": " + file.href}, tabBody);
					};
					
					var postText = file.postText;
					
					// Strip headers
					postText = postText.replace(/^([^:]+):\s?(.*)[\r|\n]|\r?\n$|[\r\n]$/gm, ""); // Remove headers and one LF
					postText = postText.replace(/[\r\n]/, ""); // Remove extra CRLF
					
					worker.postMessage(postText);
				} else {
					Flashbug.AMFInfoModule.NetInfoRep.error.replace({message:Locale.$STR("flashbug.netInfoAMF.error.load") + ": " + file.href}, tabBody);
				}
			} else {
				Firebug.DOMPanel.DirTable.tag.replace({object: file.requestAMF, toggles: this.toggles}, Dom.getChildByClass(tabBody, "flashbugAMFRequest"));
			}
		} else {
			// Create container html
			tabBody = Flashbug.AMFInfoModule.NetInfoRep.response.replace({}, tabBody);
			
			// Response
			if(!file.responseAMF) {
				if (file.responseText) {
					var worker = new Worker("chrome://flashbug/content/amf/amfWorker.js");
					var t = this;
					worker.onmessage = function(event) {
						if (event.data.type == 'debug') {
							var arr = event.data.message,
								title = arr.shift();
							trace('Worker trace - ' + title, arr);
						} else {
							trace("Worker response complete", event.data);
						
							file.responseAMF = event.data;
							Firebug.DOMPanel.DirTable.tag.replace({object: file.responseAMF, toggles: t.toggles}, Dom.getChildByClass(tabBody, "flashbugAMFResponse"));
						}
					};
					worker.onerror = function(error) {
						trace("Worker error response: " + error.message, error);
						Flashbug.AMFInfoModule.NetInfoRep.error.replace({message:Locale.$STR("flashbug.netInfoAMF.error.parse") + ": " + file.href}, tabBody);
					};
					
					var responseText = file.responseText;
					trace("responseText", responseText);
					worker.postMessage(responseText);
				} else {
					Flashbug.AMFInfoModule.NetInfoRep.error.replace({message:Locale.$STR("flashbug.netInfoAMF.error.load") + ": " + file.href}, tabBody);
				}
			} else {
				Firebug.DOMPanel.DirTable.tag.replace({object: file.responseAMF, toggles: this.toggles}, Dom.getChildByClass(tabBody, "flashbugAMFResponse"));
			}
		}
	},
	
	isAMF: function(contentType) {
		//trace(contentType + " :: " + AMF_MIME);
		if (!contentType) return false;
		if (contentType.indexOf(Flashbug.AMF_MIME) == 0) return true;
		return false;
	}
});

// ************************************************************************************************

with (Domplate) {
	Flashbug.AMFInfoModule.NetInfoRep = domplate(Firebug.Rep, {
		inspectable: false,
		
		post:
			DIV({"role": "tabpanel"},
				DIV({"class": "netInfoHeadersGroup flb-amf-group"},
					SPAN(Locale.$STR("flashbug.netInfoAMF.dataTitle")),
					SPAN({"class": "netHeadersViewSource request", onclick: "$onSave", _rowName: "RequestAMF"},
						Locale.$STR("flashbug.netInfoAMF.save")
					)
				),
				DIV({class: "flashbugAMFRequest"})
			),
		
		response:
			DIV({"role": "tabpanel"},
				DIV({"class": "netInfoHeadersGroup flb-amf-group"},
					SPAN(Locale.$STR("flashbug.netInfoAMF.dataTitle")),
					SPAN({"class": "netHeadersViewSource response", onclick: "$onSave", _rowName: "ResponseAMF"},
						Locale.$STR("flashbug.netInfoAMF.save")
					)
				),
				DIV({class: "flashbugAMFResponse"})
			),
		
		error:
			DIV({"role": "tabpanel"}, "$message"),
		
		onSave: function(event) {
			var target = event.target;
			var requestAMF = (target.rowName == "RequestAMF");
			var netInfoBox = Dom.getAncestorByClass(target, "netInfoBody");
			var file = netInfoBox.repObject;
			var dir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
			var timestamp = file.startTime || (new Date()).getTime();
			var fileName = String(file.request.URI.host + "-" + timestamp);
			
			if(requestAMF) {
				// Request/Post
				var postText = file.postText;
				postText = postText.replace(/^([^:]+):\s?(.*)[\r|\n]|\r?\n$|[\r\n]$/gm, ""); // Remove headers and one LF
				postText = postText.replace(/[\r\n]/, ""); // Remove extra CRLF
				var file = this.getTargetFile(fileName + "-Post.amf");
				if (file) IO.writeFile(file, postText);
			} else {
				// Response
				var responseText = file.responseText;
				var file = this.getTargetFile(fileName + "-Response.amf");
				if (file) IO.writeFile(file, responseText);
			}
			
			cancelEvent(event);
		},
		
		getTargetFile: function(defaultFileName) {
			var nsIFilePicker = Ci.nsIFilePicker;
			var fp = Xpcom.CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
			fp.init(window, null, nsIFilePicker.modeSave);
			fp.appendFilter("AMF Files", "*.amf");
			fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
			fp.filterIndex = 1;
			fp.defaultString = defaultFileName;
			
			var rv = fp.show();
			if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) return fp.file;
			
			return null;
		}
	});
}

// ********************************************************************************************* //
// Registration

if (Options.get("flashbug.amf.enableAMF")) {
	Firebug.registerRep(Flashbug.AMFInfoModule.NetInfoRep);
	Firebug.registerModule(Flashbug.AMFInfoModule);
}

return Flashbug.AMFInfoModule;

// ********************************************************************************************* //
});