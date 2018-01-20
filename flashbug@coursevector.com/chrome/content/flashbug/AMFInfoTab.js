FBL.ns(function() { with (FBL) {
	
const AMF_MIME = "application/x-amf";

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;
	
Firebug.AMFInfoTab = extend(Firebug.Module, {
	
	tabId1: "AMFPost",
	tabId2: "AMFResponse",
	
	trace: function(msg, obj) {
		msg = "Flashbug - AMFTab::" + msg;
		if (FBTrace.DBG_FLASH_AMF) {
			if (typeof FBTrace.sysout == "undefined") {
				Flashbug.alert(msg + " | " + obj);
			} else {
				FBTrace.sysout(msg, obj);
			}
		}
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends Module
	
	dispatchName: "AMFViewer",
	
    initialize: function() {
		this.trace("initialize");
		
		Firebug.Module.initialize.apply(this, arguments);
		
		// Add AMF as a cached content type
		var cachedTypes = Firebug.getPref(Firebug.prefDomain, "cache.mimeTypes");
		if(cachedTypes && cachedTypes.indexOf(AMF_MIME) == -1) {
			if(cachedTypes.length > 0) cachedTypes += " ";
			cachedTypes += AMF_MIME;
			Firebug.getPref(Firebug.prefDomain, "cache.mimeTypes", cachedTypes);
		}
		
		// Register NetInfoBody listener
        Firebug.NetMonitor.NetInfoBody.addListener(this);
		
		// Unregister NetRequestTable listener
        //Firebug.NetMonitor.NetRequestTable.addListener(this);
		
		// Register cache listener
		Firebug.TabCacheModel.addListener(this);
    },
	
    shutdown: function() {
		this.trace("shutdown");
		
		Firebug.Module.shutdown.apply(this, arguments);
		
		// Unregister NetInfoBody listener
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
		
		// Unregister NetRequestTable listener
		//Firebug.NetMonitor.NetRequestTable.addListener(this);
		
		// Unregister cache listener
		Firebug.TabCacheModel.removeListener(this);
    },
	
	showPanel: function(browser, panel) {
		this.trace("showPanel");
		if (panel && panel.name == "net") {
			// Append CSS
			var doc = panel.document;
			if ($("flashbugStyles", doc)) {
				// Don't append the stylesheet twice. 
			} else {
				var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/flashbug.css");
				styleSheet.setAttribute("id", "flashbugStyles");
				addStyleSheet(doc, styleSheet);
			}
		}
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends CacheListener
	
	shouldCacheRequest: function(request){
		return this.isAMF(safeGetContentType(request));
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends NetRequestTable

	/*onCreateRequestEntry: function(netRequestTable, row, file) {
		this.trace("onCreateRequestEntry", netRequestTable);
		this.trace("onCreateRequestEntry2", row);
		
		if (this.isAMF(safeGetContentType(file.request))) {
			
			// Remove the undefined category and correct it
			file.category = "amf";
			removeClass(file.row, "category-undefined");
			setClass(file.row, "flb-amf-category");
		}
	},*/
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends NetInfoBody
	
    initTabBody: function(infoBox, file) {
		this.trace("initTabBody", file);
		if (this.isAMF(safeGetContentType(file.request))) {
			this.trace("initTabBody2", infoBox);
			
			// Remove the undefined category and correct it
			//file.category = "amf";
			//removeClass(file.row, "category-undefined");
			//setClass(file.row, "flb-amf-category");
			
			Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, this.tabId1, $FL_STR("flashbug.netInfoAMF.requestTitle"));
			Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, this.tabId2, $FL_STR("flashbug.netInfoAMF.responseTitle"));
		}
	},
	
    destroyTabBody: function(infoBox, file) {},
	
    updateTabBody: function(infoBox, file, context) {
		this.trace("updateTabBody", file);
		
		// Get currently selected tab.
		var tab = infoBox.selectedTab;
		
		// Generate content only for the first time; and only if our tab has been just activated.
		if (tab.dataPresented || (!hasClass(tab, "netInfo" + this.tabId1 + "Tab") && !hasClass(tab, "netInfo" + this.tabId2 + "Tab"))) return;
		
		// Make sure the content is generated just once.
		tab.dataPresented = true;
		
		// Get body element associated with the tab.
		var isPostTab = hasClass(tab, "netInfo" + this.tabId1 + "Tab");
		var tabBody = isPostTab ? getElementByClass(infoBox, "netInfo" + this.tabId1 + "Text") : getElementByClass(infoBox, "netInfo" + this.tabId2 + "Text");
		
		if(isPostTab) {
			// Create container html
			tabBody = Firebug.FlashbugModel.NetInfoAMF.tagPost.replace({}, tabBody);
			
			// Request
			if(!file.requestAMF) {
				if (file.postText) {
					var worker = new Worker("chrome://flashbug/content/lib/AMFWorker.js");
					var t = this;
					worker.onmessage = function(event) {
						t.trace("Worker post complete", event.data);
						
						file.requestAMF = event.data;
						Firebug.DOMPanel.DirTable.tag.replace({object: file.requestAMF, toggles: t.toggles}, getChildByClass(tabBody, "flashbugAMFRequest"));
					};
					worker.onerror = function(error) {
						t.trace("Worker error post: " + error.message, error);
						Firebug.FlashbugModel.NetInfoAMF.tagError.replace({message:$FL_STR("flashbug.netInfoAMF.error.parse") + ": " + file.href}, tabBody);
					};
					
					var postText = file.postText;//Flashbug.getPostText(file);
					
					// Strip headers
					postText = postText.replace(/^([^:]+):\s?(.*)[\r|\n]|\r?\n$|[\r\n]$/gm, ""); // Remove headers and one LF
					postText = postText.replace(/[\r\n]/, ""); // Remove extra CRLF
					
					worker.postMessage(postText);
				} else {
					Firebug.FlashbugModel.NetInfoAMF.tagError.replace({message:$FL_STR("flashbug.netInfoAMF.error.load") + ": " + file.href}, tabBody);
				}
			} else {
				Firebug.DOMPanel.DirTable.tag.replace({object: file.requestAMF, toggles: this.toggles}, getChildByClass(tabBody, "flashbugAMFRequest"));
			}
		} else {
			// Create container html
			tabBody = Firebug.FlashbugModel.NetInfoAMF.tagResponse.replace({}, tabBody);
			
			// Response
			if(!file.responseAMF) {
				if (file.responseText) {
					var worker = new Worker("chrome://flashbug/content/lib/AMFWorker.js");
					var t = this;
					worker.onmessage = function(event) {
						t.trace("Worker response complete", event.data);
						
						file.responseAMF = event.data;
						Firebug.DOMPanel.DirTable.tag.replace({object: file.responseAMF, toggles: t.toggles}, getChildByClass(tabBody, "flashbugAMFResponse"));
					};
					worker.onerror = function(error) {
						t.trace("Worker error response: " + error.message, error);
						Firebug.FlashbugModel.NetInfoAMF.tagError.replace({message:$FL_STR("flashbug.netInfoAMF.error.parse") + ": " + file.href}, tabBody);
					};
					
					//var responseText = context.sourceCache.loadText(file.href, file.method, file);
					var responseText = file.responseText;//Flashbug.getResponseText2(file, context);
					this.trace("responseText", responseText);
					worker.postMessage(responseText);
				} else {
					Firebug.FlashbugModel.NetInfoAMF.tagError.replace({message:$FL_STR("flashbug.netInfoAMF.error.load") + ": " + file.href}, tabBody);
				}
			} else {
				Firebug.DOMPanel.DirTable.tag.replace({object: file.responseAMF, toggles: this.toggles}, getChildByClass(tabBody, "flashbugAMFResponse"));
			}
		}
	},
	
	isAMF: function(contentType) {
		this.trace(contentType + " :: " + AMF_MIME);
		if (!contentType) return false;
		if (contentType.indexOf(AMF_MIME) == 0) return true;
		return false;
	}
});

// ************************************************************************************************

Firebug.FlashbugModel.NetInfoAMF = domplate(Firebug.Rep, {
	inspectable: false,
	
	trace:Firebug.AMFInfoTab.trace,
	
	tagPost:
		DIV({"role": "tabpanel"},
			DIV({"class": "netInfoHeadersGroup flb-amf-group"},
				SPAN($FL_STR("flashbug.netInfoAMF.dataTitle")),
                SPAN({"class": "netHeadersViewSource request", onclick: "$onSave", _rowName: "RequestAMF"},
                    $FL_STR("flashbug.netInfoAMF.save")
                )
			),
			DIV({class: "flashbugAMFRequest"})
		),
	
	tagResponse:
		DIV({"role": "tabpanel"},
			DIV({"class": "netInfoHeadersGroup flb-amf-group"},
				SPAN($FL_STR("flashbug.netInfoAMF.dataTitle")),
                SPAN({"class": "netHeadersViewSource response", onclick: "$onSave", _rowName: "ResponseAMF"},
                    $FL_STR("flashbug.netInfoAMF.save")
                )
			),
			DIV({class: "flashbugAMFResponse"})
		),
	
	tagError:
		DIV({"role": "tabpanel"}, "$message"),
	
	onSave: function(event) {
        var target = event.target;
        var requestAMF = (target.rowName == "RequestAMF");
        var netInfoBox = getAncestorByClass(target, "netInfoBody");
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
			if(file) Flashbug.writeFile(file, postText);
		} else {
			// Response
			var responseText = file.responseText;
			var file = this.getTargetFile(fileName + "-Response.amf");
			if(file) Flashbug.writeFile(file, responseText);
		}
		
        cancelEvent(event);
    },
	
	getTargetFile: function(defaultFileName) {
        var nsIFilePicker = Ci.nsIFilePicker;
        var fp = CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
        fp.init(window, null, nsIFilePicker.modeSave);
        fp.appendFilter("AMF Files","*.amf");
        fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
        fp.filterIndex = 1;
        fp.defaultString = defaultFileName;
		
        var rv = fp.show();
        if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) return fp.file;
		
        return null;
    }
});

//////////////////////////
// Firebug Registration //
//////////////////////////

var fbVersion = Firebug.version.split('.');
if (fbVersion[0] >= 1 && fbVersion[1] >= 6) {
	if(CCSV("@mozilla.org/preferences-service;1", "nsIPrefBranch2").getBoolPref(Firebug.prefDomain + ".flashbug.enableAMF")) {
		Firebug.registerModule(Firebug.AMFInfoTab);
	}
}

/////////////////////////////
// Firebug Trace Constants //
/////////////////////////////
FBTrace.DBG_FLASH_AMF = Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_AMF");

}});