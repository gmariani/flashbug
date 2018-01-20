/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
	"firebug/lib/locale",
	"firebug/lib/string",
	"firebug/lib/trace",
	"firebug/lib/http",
	"firebug/lib/xpcom",
	"flashbug/lib/mm"
],
function(Obj, Locale, Str, FBTrace, Http, Xpcom, MM) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;
var panelName = "flashSharedObjects";

// ********************************************************************************************* //
// Custom Module Implementation

var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH_SOL) FBTrace.sysout('flashbug; SOLPanel - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('flashbug; ERROR ' + e);
	};

function SharedObjectPanel() { }
SharedObjectPanel.prototype = Obj.extend(Firebug.ActivablePanel, {
	name: panelName,
	searchable: true,
	editable: false,
	breakable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function() {
		trace("************************************************initialize sol!!!!!!!");
        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state) {
        Firebug.ActivablePanel.destroy.apply(this, arguments);
    },
    
	// this is how a panel in one window reappears in another window; lazy called
	reattach: function(doc) {
		trace("reattach");
		
		this.showVersion();
		this.refresh();
		
		Firebug.ActivablePanel.reattach.apply(this, arguments);
	},
	
	// Called at the end of module.initialize; addEventListener-s here
	initializeNode: function(panelNode) {
		trace("initializeNode");
		
		this.showVersion();
		this.refresh();
	},
	
	// persistedPanelState plus non-persisted hide() values
	show: function(state) {
		trace("show " + state + " / " + this.panelNode);
		this.showToolbarButtons("fbFlashbugVersion", true);
	},
	
	// store info on state for next show.
	hide: function(state) {
		trace("hide");
		this.showToolbarButtons("fbFlashbugVersion", false);
	},
	
	refresh: function() {
		trace("refresh");
		
		// Do we have access to the context, if so, parse
		if(this.context && this.context.solDomains) {
			this.files = this.getSharedObjectsFiles(this.context);
		} else {
			return;
		}
		
		// Create cookie list table.
		Flashbug.SharedObjectModule.TableRep.tag.replace({}, this.panelNode, Flashbug.SharedObjectModule.TableRep);
		this.summaryRow = this.panelNode.getElementsByClassName('netSummaryRow')[0];
		
		// Parse Files
		this.sols = [];
		if(this.files) {
			var t = this;
			for (var i = 0; i < this.files.length; ++i) {
				try {
					var worker = new Worker("chrome://flashbug/content/amf/solWorker.js");
					worker.onmessage = function(event) {
						var idx = event.data.fileID;
						var file = t.files[idx];
						var data = event.data.data;
						trace("Worker message file", file);
						trace("Worker message data", data);
						data.fileSize = file.fileSize;
						data.fullPath = file.path;
						data.swf = file.parent.leafName;
						data.path = file.path.replace(Flashbug.SharedObjectModule.dir.path, "");
						data.path = data.path.replace(file.leafName, "");
						t.onParseComplete(data);
					};
					worker.onerror = function(error) {
						trace("Worker error: " + error.message + "\n");
						throw error;
					};
					
					var input = Xpcom.CCIN("@mozilla.org/network/file-input-stream;1", "nsIFileInputStream");
					input.init(this.files[i], -1, -1, false);
					var contentText = Http.readFromStream(input);
					worker.postMessage({text:contentText, fileID:i});
				} catch (e) {
					ERROR(e);
				}
			}
		}
	},
	
	deleteAll: function() {
		trace("deleteAll");
		for (var i = 0; i < this.files.length; ++i) {
			var file = this.files[i];
			if(file.exists()) {
				try {
					file.remove(false);
				} catch (e) {
					ERROR(e);
				}
			}
		}
		
		Flashbug.SharedObjectModule.refresh(this.context);
	},
	
	onParseComplete: function(data) {
		trace("onParseComplete", data);
		this.sols.push(data);
		
		// Create cookie list table.
		Flashbug.SharedObjectModule.TableRep.tag.replace({}, this.panelNode, Flashbug.SharedObjectModule.TableRep);
		this.summaryRow = this.panelNode.getElementsByClassName("netSummaryRow")[0];
		
		// Generate HTML list of cookies using domplate.
		var totalSize = 0;
        if (this.sols.length) {
            var header = this.panelNode.getElementsByClassName("netHeaderRow")[0];
            var row = Flashbug.SharedObjectModule.RowRep.tag.insertRows({cookies: this.sols}, header)[0];
            for (var i = 0; i < this.sols.length; ++i) {
                var cookie = this.sols[i];
                cookie.row = row;
				totalSize += cookie.fileSize;
                row.repObject = cookie;
                row = row.nextSibling;
            }
        }
		
		var countLabel = this.panelNode.getElementsByClassName("netCountLabel")[0];
		countLabel.innerHTML = this.sols.length > 0 ? this.sols.length + ' ' + Locale.$STR('flashbug.menu.sharedobject') : '-';
		
		var totalSizeLabel = this.panelNode.getElementsByClassName("netTotalSizeLabel")[0];
		totalSizeLabel.innerHTML = Str.formatSize(totalSize);
		
		Firebug.ActivablePanel.refresh.apply(this, arguments);
	},
	
	// Called when "Options" clicked. Return array of
    // {label: 'name', nol10n: true,  type: "checkbox", checked: <value>, command:function to set <value>}
	getOptionsMenuItems: function(context) {
		trace("getOptionsMenuItems");
		return [
			{
				label: Locale.$STR("flashbug.options.pref"),
				nol10n: true,
				type: "button",
				command: function() {
					context.chrome.window.openDialog("chrome://flashbug/content/preferences.xul", "flashbugPreferences", "chrome,titlebar,toolbar,centerscreen,modal");
				}
			}
		];
    },
	
	/////////////////////////////
	// Shared Objects Specific //
	/////////////////////////////
	
	name: panelName,
	files: [],
	sols: [],
	order: 100,
	summaryRow: null,
	
	// Gets all shared objects for each domain
	getSharedObjectsFiles: function(context) {
		trace("getSharedObjectsFiles");
		var arrFiles = [];
		try {
			for (var key in context.solDomains) {
				var dir2 = Xpcom.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
				dir2.initWithPath(Flashbug.SharedObjectModule.dir.path);
				dir2.append(context.solDomains[key]);
				this.getFiles(arrFiles, dir2);
			}
		} catch(err){
			ERROR(err);
		}
		
		trace("getSharedObjectsFiles - Files", arrFiles);
		return arrFiles;
	},
	
	// Recursively runs through all folders searching for files
	getFiles: function(arrFiles, dir) {
		trace("getFiles");
		if(dir.exists()) {
			var entries = dir.directoryEntries;
			while(entries.hasMoreElements()) {
				var entry = entries.getNext();
				entry.QueryInterface(Ci.nsIFile);
				if(entry.isDirectory()) {
					this.getFiles(arrFiles, entry);
				} else if(entry.isFile()) {
					arrFiles.push(entry);
				}
			}
		}
	},
	
	showVersion: function() {
		var version = MM.playerVersion;
		trace("showVersion : '" + version + "'");
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = version;
	}
});

return SharedObjectPanel;
});