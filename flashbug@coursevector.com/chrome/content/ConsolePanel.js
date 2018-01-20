/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
	"firebug/lib/options",
	"firebug/lib/locale",
	"firebug/lib/css",
	"firebug/lib/dom",
	"firebug/lib/xpcom",
	"firebug/lib/system",
	"firebug/chrome/window",
    "firebug/lib/trace",
	"flashbug/lib/mm"
],
function(Obj, Options, Locale, Css, Dom, Xpcom, System, Win, FBTrace, MM) {
	
// Check if Flash Player Trust File needs to be created
if(!MM.checkTrustFile()) MM.saveTrustFile();

// ********************************************************************************************* //
// Custom Panel Implementation

var panelName = "flashConsole";
var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH_CONSOLE) FBTrace.sysout('flashbug; ConsolePanel - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('flashbug; ERROR ' + e);
	};

function ConsolePanel() {}
ConsolePanel.prototype = Obj.extend(Firebug.ActivablePanel, {
    name: panelName,
	searchable: true,
	editable: false,
	breakable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function() {
		trace("************************************************initialize!!!!!!!");
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
		trace("************************************************initializeNode!!!!!!!");
		
		// Add Divs
		Flashbug.ConsoleModule.BodyRep.tag.replace({}, this.panelNode, this);
		this.traceNode = this.panelNode.getElementsByClassName("flb-trace-info-trace-text")[0];
		this.policyNode = this.panelNode.getElementsByClassName("flb-trace-info-policy-text")[0];
		
		// Select Log just so selectedNode is populated
		this.showLog();
		
		this.showVersion();
	},

    show: function(state) {
		trace("show");
		
		// Show Player Version
		this.showToolbarButtons("fbFlashbugVersion", true);
		
		// Open last/default tab
		if(Options.get("flashbug.console.defaultTab") == "trace") {
			Firebug.chrome.$("flashbugLogFilter-trace").checked = true;
		} else {
			Firebug.chrome.$("flashbugLogFilter-policy").checked = true;
		}
		
		this.refresh();
		
        Firebug.ActivablePanel.show.apply(this, arguments);
    },
	
	// store info on state for next show.
	hide: function(state) {
		trace("hide");
		
		// Hide Player Version
		this.showToolbarButtons("fbFlashbugVersion", false);
	},

    refresh: function() {
        trace("refresh");
		
		// Set the tooltips and update break-on-next button's state.
        var shouldBreak = this.shouldBreakOnNext();
        Firebug.Breakpoint.updateBreakOnNextState(this, shouldBreak);
        Firebug.Breakpoint.updateBreakOnNextTooltips(this);
        Firebug.Breakpoint.updatePanelTab(this, shouldBreak);
		
		// Get node associated with reader
		var selectedReader = Flashbug.ConsoleModule.selectedReader;
		var node = (selectedReader.name == "Trace") ? this.traceNode : this.policyNode;
		
		// Populate Node
		node.innerHTML = "";
		node.appendChild(selectedReader.divLog);
		
		// If node is displayed & Auto scroll
		if(node == this.selectedNode && Options.get("flashbug.console.autoScroll")) {
			Dom.scrollToBottom(this.panelNode);
		}
    },
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
	
	search: function(text, reverse) {
		trace("search - text:" + text + " reverse:" + reverse);
		
		if (!text) {
            delete this.currentSearch;
            return false;
        }
		
        var row;
        if (this.currentSearch && text == this.currentSearch.text) {
            row = this.currentSearch.findNext(true, false, reverse, Firebug.Search.isCaseSensitive(text));
        } else {
            this.currentSearch = new LogPanelSearch(this);
            row = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
        }
		
        if (row) {
            var sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);
			
            Dom.scrollIntoCenterView(row, this.panelNode);
			Css.setClassTimed(row, "jumpHighlight", this.context);
            return true;
        } else {
            return false;
        }
    },
	
	getSearchOptionsMenuItems: function() {
		return [
			Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive"),
			//Firebug.Search.searchOptionMenu("search.Use Regular Expression", "searchUseRegularExpression")
		];
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
	
	getOptionsMenuItems: function(context) {
		trace("getOptionsMenuItems");
		return [
			{
				label: Locale.$STR("flashbug.options.autoscroll"),
				type: "checkbox",
				checked: Options.get("flashbug.console.autoScroll"),
				option: "flashbug.autoScroll",
				tooltiptext: Locale.$STR("flashbug.options.autoscrollToolTip"),
				command: Obj.bindFixed(Options.set, Options, "flashbug.console.autoScroll", !Options.get("flashbug.console.autoScroll"))
			},
			"-",
			{
				label: Locale.$STR("flashbug.options.pref"),
				command: function() {
					context.chrome.window.openDialog("chrome://flashbug/content/preferences.xul", "flashbugPreferences", "chrome,titlebar,toolbar,centerscreen,modal");
				}
			}
		];
    },
	
	getContextMenuItems: function(object, target, context) {
		trace("getContextMenuItems");
        
		// Remove default 'Copy' command
        var popup = Firebug.chrome.$("fbContextMenu");
        if (popup.firstChild && popup.firstChild.getAttribute("command") == "cmd_copy") popup.removeChild(popup.firstChild);
		
		var items = [];
		if(target.className == "flb-link") {
			items.push({label: Locale.$STR("flashbug.contextMenu.copyLocation"), command: Obj.bindFixed(System.copyToClipboard, System, target.textContent) });
			items.push({label: Locale.$STR("flashbug.contextMenu.openTab"), command: Obj.bindFixed(Win.openNewTab, Win, target.textContent) });
		} else {
			items.push({label: Locale.$STR("flashbug.contextMenu.copy"), command: Obj.bindFixed(System.copyToClipboard, System, target.textContent) });
		}
		
        return items;
    },
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for Break On Next
	
	breakOnNext: function(armed) {
		if (armed) {
			Flashbug.ConsoleModule.onPause(null, this);
		} else {
			Flashbug.ConsoleModule.onPlay(null, this);
		}
	},
	
	shouldBreakOnNext: function() {
		return Flashbug.ConsoleModule.selectedReader.paused;
	},
	
	getBreakOnNextTooltip: function(enable) {
		if(enable) {
			return Locale.$STR("flashbug.logPanel.toolbar.play");
		} else {
			return Locale.$STR("flashbug.logPanel.toolbar.pause");
		}
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
	// Flashbug Specific
	
	traceNode: null,
	policyNode: null,
	selectedNode: null,
	order: 70,
	
	showLog: function() {
		trace("showLog - " + Options.get("flashbug.console.defaultTab"));
		
		if (this.selectedNode) this.selectedNode.removeAttribute("selected");
		this.selectedNode = Dom.getChildByClass(this.panelNode.firstChild, "flb-trace-info-" + Options.get("flashbug.console.defaultTab").toLowerCase() + "-text");
		this.selectedNode.setAttribute("selected", "true");
		
		// So search doesn't freeze when switching logs
		delete this.currentSearch;
	},
	
	showVersion: function() {
		var version = MM.playerVersion;
		trace("showVersion : '" + version + "'");
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = version;
	}
});

// ********************************************************************************************* //
// Firebug Search, Copied from net.js
var LogPanelSearch = function(panel, rowFinder) {
	var panelNode = panel.panelNode;
	var doc = panelNode.ownerDocument;
	var searchRange, startPt;
	trace("panelNode", panelNode);
	trace("doc", doc);

	// Common search object methods.
	this.find = function(text, reverse, caseSensitive) {
		this.text = text;
		
		finder.findBackwards = !!reverse;
		finder.caseSensitive = !!caseSensitive;
		
		this.currentRow = this.getFirstRow();
		this.resetRange();
		
		return this.findNext(false, false, reverse, caseSensitive);
	};

	this.findNext = function(wrapAround, sameNode, reverse, caseSensitive) {
		while (this.currentRow) {
			var match = this.findNextInRange(reverse, caseSensitive);
			if (match) return match;
			
			// Here is where they used regex to test if the response body has the text
			
			this.currentRow = this.getNextRow(wrapAround, reverse);
			
			if (this.currentRow) this.resetRange();
		}
		
		return null;
	};

	// Internal search helpers.
	this.findNextInRange = function(reverse, caseSensitive) {
		if (this.range) {
			startPt = doc.createRange();
			if (reverse) {
				startPt.setStartBefore(this.currentNode);
			} else {
				startPt.setStart(this.currentNode, this.range.endOffset);
			}
			
			this.range = finder.Find(this.text, searchRange, startPt, searchRange);
			if (this.range) {
				this.currentNode = this.range ? this.range.startContainer : null;
				return this.currentNode ? this.currentNode.parentNode : null;
			}
		}
		
		if (this.currentNode) {
			startPt = doc.createRange();
			if (reverse) {
				startPt.setStartBefore(this.currentNode);
			} else {
				startPt.setStartAfter(this.currentNode);
			}
		}
		
		this.range = finder.Find(this.text, searchRange, startPt, searchRange);
		this.currentNode = this.range ? this.range.startContainer : null;
		return this.currentNode ? this.currentNode.parentNode : null;
	},

	// Helpers
	this.resetRange = function() {
		searchRange = doc.createRange();
		searchRange.setStart(this.currentRow, 0);
		searchRange.setEnd(this.currentRow, this.currentRow.childNodes.length);
		
		startPt = searchRange;
	}

	this.getFirstRow = function() {
		var selectedReader = Flashbug.ConsoleModule.selectedReader;
		var node = (selectedReader.name == "Trace") ? panel.traceNode : panel.policyNode;
		return node.firstChild;
	}

	this.getNextRow = function(wrapAround, reverse) {
		// xxxHonza: reverse searching missing.
		for (var sib = this.currentRow.nextSibling; sib; sib = sib.nextSibling) {
			if (hasClass(sib, "flb-trace-row")) {
				return sib;
			}
		}
		
		return wrapAround ? this.getFirstRow() : null;
	}
};

return ConsolePanel;
});