/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
	"firebug/lib/css",
	"firebug/lib/dom",
	"firebug/lib/domplate",
	"firebug/lib/events",
	"firebug/lib/options",
	"firebug/lib/locale",
	"firebug/lib/trace",
	"firebug/lib/string",
	"firebug/lib/url",
	"firebug/lib/xpcom",
	"firebug/lib/system",
	"firebug/chrome/window",
	"firebug/lib/http",
	"firebug/net/netUtils",
	"flashbug/lib/mm",
	"flashbug/lib/io"
],
function(Obj, Css, Dom, Domplate, Events, Options, Locale, FBTrace, Str, Url, Xpcom, System, Win, Http, NetUtils, MM, IO) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;
var panelName = "flashSharedObjects";

Locale.registerStringBundle("chrome://flashbug/locale/flashbug.properties");

// ********************************************************************************************* //
// Custom Module Implementation

var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH_SOL) FBTrace.sysout('flashbug; SOLModule - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('flashbug; ERROR ' + e);
	};

function cloneMap(map) {
    var newMap = [];
    for (var item in map) {
        newMap[item] = map[item];
	}
        
    return newMap;
}

// Helper array for prematurely created contexts
var contexts = new Array();
	
Flashbug.SharedObjectModule = Obj.extend(Firebug.ActivableModule, {
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
	// Firebug Module Override
	
	/**
	* Called by Firebug when Firefox window is opened.
	*/
	initialize: function(prefDomain, prefNames) {
		trace("initialize");
		
		// Initialize directories and titles
		var dir = MM.flashPlayerDirectory;
		dir.append("#SharedObjects");
		var entries = dir.directoryEntries;
		var entry;
		while(entries.hasMoreElements()) {
			entry = entries.getNext();
			entry.QueryInterface(Ci.nsIFile);
			if (entry.isDirectory()) break;
		}
		this.dir = entry;
		this.dispatchName = Locale.$STR('flashbug.solPanel.title');
		this.description = Locale.$STR('flashbug.solPanel.description');
		
		Firebug.NetMonitor.addListener(this);
		Firebug.Module.initialize.apply(this, arguments);
	},
	
	initializeUI: function(detachArgs) {
		Firebug.Module.initializeUI.apply(this, arguments);
	},
	
	/**
	* Called by Firebug when Firefox window is closed.
	*/
    shutdown: function() {
		trace("shutdown");
		Firebug.NetMonitor.removeListener(this);
    },
	
	/**
	* Called when a new context is created but before the page is loaded.
	*/
	initContext: function(context, persistedState) {
		trace("initContext");
		
		var tabId = Win.getTabIdForWindow(context.window);
		
		// Create sub-context for solDomains. The solDomains object exists within the context even if the panel is disabled
        context.solDomains = {};
		context.length = 0;
		
		// The temp context isn't created e.g. for empty tabs, chrome pages.
        var tempContext = contexts[tabId];
        if (tempContext) {
            this.destroyTempContext(tempContext, context);
            delete contexts[tabId];
        }
    },
	
	/**
	* Called when a context is destroyed. Module may store info on persistedState for reloaded pages.
	*/
	destroyContext: function(context) {
		trace("destroyContext");
		
		for (var p in context.solDomains) {
            delete context.solDomains[p];
		}
		
        delete context.solDomains;
    },
	
	/*
	* After "onSelectingPanel", a panel has been selected but is not yet visible
	*/
    showPanel: function(browser, panel) {
        var isPanel = panel && panel.name == panelName;
        Dom.collapse(Firebug.chrome.$("fbFlashbugSOButtons"), !isPanel);
        Dom.collapse(Firebug.chrome.$("fbFlashbugVersion"), !isPanel);
    },
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
	// Flashbug Specific
	
	dispatchName: 'flashbug.solPanel.title',
	description: 'flashbug.solPanel.description',
	dir: null,
	
	openPath: function(url) {
		trace("openPath");
		var f = Xpcom.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
		f.initWithPath(url);
		IO.launchFile(f);
	},

	// Asks the operating system to open the folder which contains this file or folder. 
	// This routine only works on platforms which support the ability to open a folder. 
	revealPath: function(url) {
		trace("revealPath");
		var f = Xpcom.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
		f.initWithPath(url);
		
		try {
			f.reveal();
		} catch (ex) {
			// If reveal fails for some reason (e.g., it's not implemented on unix or
			// the file doesn't exist), try using the parent if we have it.
			var parent = Xpcom.QI(f.parent, Ci.nsILocalFile);
			if (!parent) return;
			
			// "Double click" the parent directory to show where the file should be
			this.openPath(parent.path);
		}
	},
	
	destroyTempContext: function(tempContext, context) {
        if (!tempContext) return;
		
		context.solDomains = cloneMap(tempContext.solDomains);

        delete tempContext.solDomains;
    },
	
	onResponse: function(context, file) {
		trace("onResponse");
		this.addDomain(context, file, file.request.URI.asciiSpec);
	},
	
	onCachedResponse: function(context, file) {
		trace("onCachedResponse");
		this.addDomain(context, file, file.request.URI.asciiSpec);
	},
	
	onExamineResponse: function(context, request) {
		trace("onExamineResponse");
		this.addDomain(context, request, request.URI.asciiSpec);
	},
	
	onExamineCachedResponse: function(context, request) {
		trace("onExamineCachedResponse");
		this.addDomain(context, request, request.URI.asciiSpec);
	},
	
	addDomain: function(context, file, href) {
		trace("addDomain", file);
		var request = file.hasOwnProperty('request') ? file.request : file;
		
		try {
			var contentType = request.contentType;
		} catch (e) {
			// Component returned failure code: 0x80040111 (NS_ERROR_NOT_AVAILABLE) [nsIHttpChannel.contentType]
			return;
		}
		
		var domain = Url.getPrettyDomain(href);
		var fullDomain = Url.getDomain(href);
		
		// Fix domains with ports
		var portIndex = domain.lastIndexOf(":");
		if (portIndex != -1) domain = domain.slice(0, portIndex);
		
		// Fix localhost
		if (domain == "localhost") domain = "#" + domain;
		
		// For some reason some shared objects aren't saved to the domain, but the basedomain
		// Maybe for old swfs? The example is Flash 6
		// i.e. http://netticat.ath.cx/BetterPrivacy/BetterPrivacy.htm
		var arrDomain = domain.split(".");
		while (arrDomain.length > 2) {
			arrDomain.shift();
		}
		var baseDomain = arrDomain.join(".");
		
		// Get MIME Type
		var mimeType = NetUtils.getMimeType(contentType, request.name);
		if (mimeType == null) {
			var ext = Url.getFileExtension(request.name);
			if (ext) {
				var extMimeType = ext.toLowerCase() == 'spl' ? Flashbug.SPL_MIME : ext.toLowerCase() == 'swf' ? Flashbug.SWF_MIME : null;
				if (extMimeType) mimeType = extMimeType;
			}
		}
		
		var tabId = Win.getTabIdForWindow(context.window);

		// Create temporary context
		if (!contexts[tabId]) {
			var tempContext = {tabId:tabId, solDomains:{}, length:0 };
			contexts[tabId] = tempContext;
		}

        // Use the temporary context first, if it exists. There could be an old
        // context (associated with this tab) for the previous URL.
        var context2 = contexts[tabId];
        context2 = context2 ? context2 : context;
		
		// For some reason this isn't always available
		if (!context2.hasOwnProperty("solDomains")) {
			context2.solDomains = {};
			context2.length = 0;
		}
		
		// If is a SWF, add domain(s)
		if (mimeType == Flashbug.SWF_MIME || mimeType == Flashbug.SPL_MIME) {
			var hasAdded = false,
				isFirst = (context2.length == 0);
				
			if (!context.solDomains[domain]) {
				context.solDomains[domain] = domain;
				hasAdded = true;
				trace("addDomain: " + context.solDomains[domain]);
			}
			
			if (!context.solDomains[fullDomain]) {
				context.solDomains[fullDomain] = fullDomain;
				hasAdded = true;
				trace("addDomain: " + context.solDomains[fullDomain]);
			}
			
			if (!context.solDomains[baseDomain]) {
				context.solDomains[baseDomain] = baseDomain;
				hasAdded = true;
				trace("addDomain: " + context.solDomains[baseDomain]);
			}
			
			// Refresh the panel asynchronously.
			if(hasAdded && context instanceof Firebug.TabContext) context.invalidatePanels(panelName); 
			
			// Refresh the panel asynchronously.
			/*if(hasAdded && context instanceof Firebug.TabContext) {
				if (isFirst) {
					context.invalidatePanels(panelName);
				} else {
					context.getPanel(childPanelName).append(file);
				}
			}*/
		}
	},
	
	refresh: function(context) {
		trace("refresh");
		
		var panel = context.getPanel(panelName, true);
		if(panel) panel.refresh();
	},
	
	deleteAll: function(context) {
		trace("deleteAll");
		
		var panel = context.getPanel(panelName, true);
		if(panel) panel.deleteAll();
	}
});

// ********************************************************************************************* //
// DOMPlate Implementation

with (Domplate) {
	Flashbug.SharedObjectModule.TableRep = domplate(Firebug.Rep, {
		inspectable: false,
	
		tag:
			TABLE({class: "netTable", cellpadding: 0, cellspacing: 0, hiddenCols: ""},
				TBODY(
					TR({class: "netHeaderRow netRow", onclick: "$onClickHeader"},
						TD({id: "colBreakBar", "class": "netHeaderCell"},
							"&nbsp;"
						),
						TD({id: "colName", class: "netHeaderCell alphaValue"},
							DIV({class: "netHeaderCellBox", title: Locale.$STR("flashbug.solPanel.colName.tooltip")}, Locale.$STR("flashbug.solPanel.colName.title"))
						),
						TD({id: "colVersion", class: "netHeaderCell alphaValue"},
							DIV({class: "netHeaderCellBox", title: Locale.$STR("flashbug.solPanel.colVersion.tooltip")}, Locale.$STR("flashbug.solPanel.colVersion.title"))
						),
						TD({id: "colSize", class: "netHeaderCell"},
							DIV({class: "netHeaderCellBox", title: Locale.$STR("flashbug.solPanel.colSize.tooltip")}, Locale.$STR("flashbug.solPanel.colSize.title"))
						),
						TD({id: "colSWF", class: "netHeaderCell"},
							DIV({class: "netHeaderCellBox", title: Locale.$STR("flashbug.solPanel.colSWF.tooltip")}, Locale.$STR("flashbug.solPanel.colSWF.title"))
						),
						TD({id: "colPath", class: "netHeaderCell alphaValue"},
							DIV({class: "netHeaderCellBox", title: Locale.$STR("flashbug.solPanel.colPath.tooltip")}, Locale.$STR("flashbug.solPanel.colPath.title"))
						)
					),
					TR({"class": "netRow netSummaryRow"},
						TD({"class": "netCol"}, "&nbsp;"),
						TD({"class": "netCol netHrefCol"},
							DIV({"class": "netCountLabel netSummaryLabel"}, "-")
						),
						TD({"class": "netCol"}),
						TD({"class": "netTotalSizeCol netCol netSizeCol"},
							DIV({"class": "netTotalSizeLabel netSummaryLabel"}, "0KB")
						),
						TD({"class": "netCol"}),
						TD({"class": "netCol"})
					)
				)
			),
	
		onClickHeader: function(event) {
			if (!Events.isLeftClick(event)) return;
			if (event.target.id == 'colBreakBar') return;
			
			var table = Dom.getAncestorByClass(event.target, "netTable");
			var column = Dom.getAncestorByClass(event.target, "netHeaderCell");
			this.sortColumn(table, column);
		},
	
		sortColumn: function(table, col, direction) {
			if (!col) return;
			
			if (typeof(col) == "string") {
				var doc = table.ownerDocument;
				col = doc.getElementById(col);
			}
			
			if (!col) return;
			
			var numerical = !Css.hasClass(col, "alphaValue");
			
			var colIndex = 0;
			for (col = col.previousSibling; col; col = col.previousSibling) {
				++colIndex;
			}
			
			this.sort(table, colIndex, numerical, direction);
		},
	
		sort: function(table, colIndex, numerical, direction) {
			var tbody = table.lastChild;
			var summaryRow = tbody.lastChild;
			var headerRow = tbody.firstChild;
			
			// Remove class from the currently sorted column
			var headerSorted = Dom.getChildByClass(headerRow, "netHeaderSorted");
			Css.removeClass(headerSorted, "netHeaderSorted");
			
			// Mark new column as sorted.
			var header = headerRow.childNodes[colIndex];
			Css.setClass(header, "netHeaderSorted");
			
			// If the column is already using required sort direction, bubble out.
			if ((direction == "desc" && header.sorted == 1) || (direction == "asc" && header.sorted == -1)) return;
			
			var values = [];
			for (var row = tbody.childNodes[1]; row; row = row.nextSibling) {
				var cell = row.childNodes[colIndex];
				var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
				
				if (Css.hasClass(row, "opened")) {
					var cookieInfoRow = row.nextSibling;
					values.push({row: row, value: value, info: cookieInfoRow});
					row = cookieInfoRow;
				} else {
					values.push({row: row, value: value});
				}
			}
			
			values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });
			
			if ((header.sorted && header.sorted == 1) || (!header.sorted && direction == "asc")) {
				Css.removeClass(header, "sortedDescending");
				Css.setClass(header, "sortedAscending");
				
				header.sorted = -1;
				
				for (var i = 0; i < values.length; ++i) {
					tbody.insertBefore(values[i].row, summaryRow);
					if (values[i].info) tbody.insertBefore(values[i].info, summaryRow);
				}
			} else {
				Css.removeClass(header, "sortedAscending");
				Css.setClass(header, "sortedDescending");
				
				header.sorted = 1;
				
				for (var i = values.length-1; i >= 0; --i) {
					tbody.insertBefore(values[i].row, summaryRow);
					if (values[i].info) tbody.insertBefore(values[i].info, summaryRow);
				}
			}
			
			// Remember last sorted column & direction in preferences.
			var prefValue = header.getAttribute("id") + " " + (header.sorted > 0 ? "desc" : "asc");
			Options.get("flashbug.sol.lastSortedColumn", prefValue);
		},
	
		supportsObject: function(object) {
			return (object == this);
		}
	});
	
	/**
	 * @domplate Represents a domplate template for cookie entry in the cookie list.
	 */
	Flashbug.SharedObjectModule.RowRep = domplate(Firebug.Rep, {
		inspectable: false,
	
		tag:
			FOR("cookie", "$cookies",
				TR({class: "flb-so-row", _repObject: "$cookie", onclick: "$onClickRow"},
					TD({"class": "netDebugCol netCol"},
					   DIV({"class": "sourceLine netRowHeader"}, "&nbsp;")
					),
					TD({class: "flb-so-name-col flb-so-col netCol"},
						DIV({class: "flb-so-name-label netLabel"}, "$cookie|getName")
					),
					TD({class: "flb-so-version-col flb-so-col netCol"},
						SPAN({class: "flb-so-version-label netLabel"}, "$cookie|getVersion")
					),
					TD({class: "flb-so-size-col flb-so-col netCol"},
						DIV({class: "flb-so-size-label netLabel"}, "$cookie|getSize")
					),
					TD({class: "flb-so-swf-col flb-so-col netCol"},
						DIV({class: "flb-so-swf-label netLabel"}, "$cookie|getSWF")
					),
					TD({class: "flb-so-path-col flb-so-col netCol"},
						DIV({class: "flb-so-path-label netLabel", title: "$cookie|getPath"},
							SPAN("$cookie|getPath")
						)
					)
				)
			),
	
		bodyRow:
			TR({class: "cookieInfoRow"},
				TD({"class": "netDebugCol netCol"},
				   DIV({"class": "sourceLine netRowHeader"}, "&nbsp;")
				),
				TD({class: "flb-so-info-col", colspan: 5},
					DIV({"class": "netInfoTabs focusRow subFocusRow"},
						A({"class": "netInfoParamsTab netInfoTab", selected:'true' },
							'Value'
						)
					),
					DIV({class: "flb-so-info-body"},
						DIV({class: "cookieInfoValueText flb-so-info-text", selected:true})
					)
				)
			),
	
		hasProperties: function (ob) {
			try {
				for (var name in ob) {
					return true;
				}
			} catch (exc) {}
			return false;
		},
		
		getName: function(cookie) {
			return cookie.header.fileName;
		},
	
		getVersion: function(cookie) {
			return "AMF" + cookie.header.amfVersion;
		},
	
		getSize: function(cookie) {
			return Str.formatSize(cookie.fileSize);
		},
		
		getSWF: function(cookie) {
			var swf = cookie.swf;
			if(swf.indexOf(".swf") == -1) swf = null;
			return swf ? swf : "?";
		},
	
		getPath: function(cookie) {
			var path = cookie.path;
			return path ? path : "?";
		},
		
		// Firebug rep support
		supportsObject: function(cookie) {
			return (cookie.fullPath && cookie.fileSize && cookie.header && cookie.body);
		},
		
		browseObject: function(cookie, context) {
			return false;
		},
	
		getRealObject: function(cookie, context) {
			return cookie.body;
		},
		
		onRemove: function(url, context) {
			var file = Xpcom.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
			file.initWithPath(url);
			
			if(file.exists()) {
				try {
					file.remove(false);
				} catch (e) {
					ERROR(e);
				}
			}
			
			Flashbug.SharedObjectModule.refresh(context);
		},
		
		getContextMenuItems: function(data, target, context) {
			var items = [];
			var url = data.fullPath;
			
			items.push(
				{label: Locale.$STR("flashbug.contextMenu.delete"), nol10n: true, command: Obj.bindFixed(this.onRemove, this, url, context) },
				"-",
				{label: Locale.$STR("flashbug.contextMenu.open"), nol10n: true, command: Obj.bindFixed(Flashbug.SharedObjectModule.openPath, this, url) },
				{label: Locale.$STR("flashbug.contextMenu.openFolder"), nol10n: true, command: Obj.bindFixed(Flashbug.SharedObjectModule.revealPath, this, url) },
				"-",
				{label: Locale.$STR("flashbug.contextMenu.copyLocation"), nol10n: true, command: Obj.bindFixed(System.copyToClipboard, System, url) }
			);
			
			return items;
		},
	
		onClickRow: function(event) {
			if (Events.isLeftClick(event)) {
				var row = Dom.getAncestorByClass(event.target, "flb-so-row");
				if (row) {
					this.toggleRow(row);
					Events.cancelEvent(event);
				}
			}
		},
		
		toggles: {},
	
		toggleRow: function(row) {
			var opened = Css.hasClass(row, "opened");
			Css.toggleClass(row, "opened");
			if (Css.hasClass(row, "opened")) {
				var bodyRow = this.bodyRow.insertRows({}, row)[0];
				Firebug.DOMPanel.DirTable.tag.replace({object: row.repObject.body, toggles: this.toggles}, bodyRow.childNodes[1].childNodes[1].childNodes[0]);
			} else {
				row.parentNode.removeChild(row.nextSibling);
			}
		}
	});
};

return Flashbug.SharedObjectModule;
});