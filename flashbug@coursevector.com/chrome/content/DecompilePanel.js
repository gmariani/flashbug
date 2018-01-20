/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
	"firebug/lib/locale",
	"firebug/lib/trace",
	"firebug/chrome/window",
	"flashbug/lib/mm"
],
function(Obj, Locale, FBTrace, Win, MM) {

// ********************************************************************************************* //
// Constants

var panelName = "flashDecompiler",
	treePanel = "flashDecompilerTree";

// ********************************************************************************************* //
// Custom Module Implementation

var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH_DECOMPILER) FBTrace.sysout('flashbug; DecompilePanel - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('flashbug; ERROR ' + e);
	};

function DecompilePanel() { }
DecompilePanel.prototype = Obj.extend(Firebug.ActivablePanel, {
	
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Inspector Panel																		  //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	////////////////////////////
	// Firebug Panel Override //
	////////////////////////////
	
	initialize: function(context, doc) {
		trace('initialize');
		this.panelSplitter = Firebug.chrome.$("fbPanelSplitter");
		this.sidePanelDeck = Firebug.chrome.$("fbSidePanelDeck");
		
		Firebug.ActivablePanel.initialize.apply(this, arguments);
	},
	
	// Called at the end of module.initialize; addEventListener-s here
	initializeNode: function(panelNode) {
		trace('initializeNode');
		this.showVersion();
		this.refresh();
	},
	
	// this is how a panel in one window reappears in another window; lazy called
	reattach: function(doc) {
		this.showVersion();
		this.refresh();
		
		Firebug.ActivablePanel.reattach.apply(this, arguments);
	},
	
	// persistedPanelState plus non-persisted hide() values
	show: function(state) {
		trace('show');
		this.showToolbarButtons("fbFlashbugVersion", true);
		
		//Flashbug.FlashModule.onObserverChange(null);
	},
	
	// store info on state for next show.
	hide: function(state) {
		this.showToolbarButtons("fbFlashbugVersion", false);
	},
	
	// Called when "Options" clicked. Return array of
	// {label: 'name', nol10n: true,  type: "checkbox", checked: <value>, command:function to set <value>}
	getOptionsMenuItems: function(context) {
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
	
	onActivationChanged: function(enable) {
		//trace('onActivationChanged');
		if (enable) {
			//Flashbug.FlashModule.addObserver(this);
			Flashbug.DecompileModule.addObserver(this);
		} else {
			//Flashbug.FlashModule.removeObserver(this);
			Flashbug.DecompileModule.removeObserver(this);
		}
	},
	
	////////////////////////
	// Inspector Specific //
	////////////////////////
	
	name: panelName,
	searchable: true,
	//inspectable: true,
   // breakable: false,
   // inspectorHistory: new Array(5),
	order: 90,
	
	refresh: function() {
		//trace('refresh');
		var tabId = Win.getTabIdForWindow(this.context.window);
		var context = Flashbug.DecompileModule.contexts[tabId];
        context = context ? context : Firebug.TabWatcher.getContextByWindow(this.context.window);
		//trace('context', context);
		// Do we have access to the context, if so, parse
		if(context && context.swfs) {
			//
		} else {
			return;
		}
		
		Firebug.currentContext.getPanel(treePanel).refresh(context.swfs);
	},
	
	showDetails: function(item) {
		try {
			if (item instanceof Array) {
				Flashbug.DecompileModule.Header.doc = this.document;
				Flashbug.DecompileModule.Header.tag.replace({param:item[0]}, this.panelNode, Flashbug.DecompileModule.Header);
				if (item.length > 1) Flashbug.DecompileModule.Header.tag.append({param:item[1]}, this.panelNode, Flashbug.DecompileModule.Header);
			} else {
				Flashbug.DecompileModule[item.type].doc = this.document;
				Flashbug.DecompileModule[item.type].tag.replace({param:item}, this.panelNode, Flashbug.DecompileModule[item.type]);
			}
		} catch(e) { ERROR(e) }
	},
	
	showVersion: function() {
		var version = MM.playerVersion;
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = version;
	}
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(DecompilePanel);

return DecompilePanel;

// ********************************************************************************************* //
});