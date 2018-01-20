FBL.ns(function() { with (FBL) {

// Constants
const panelName = "flbInspector";
const observerSvc = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
// side panels
const apiPanel = "flbInspectorAPI";

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;

// Integrate native inspection
// Integrate search

var trace = function(msg, obj) {
	msg = "Flashbug - Flash::" + msg;
	if (FBTrace.DBG_FLASH_INSPECTOR) {
		if (typeof FBTrace.sysout == "undefined") {
			Flashbug.alert(msg + " | " + obj);
		} else {
			FBTrace.sysout(msg, obj);
		}
	}
}

// Module Implementation
//-----------------------------------------------------------------------------

Flashbug.FlashModule = extend(Firebug.ActivableModule, {
	
	/////////////////////////////////////////////////////////////////////////////////////////
	// Inspector Module																	//
	/////////////////////////////////////////////////////////////////////////////////////////
	
	/////////////////////////////
	// Firebug Module Override //
	/////////////////////////////
	
	/**
	* Called by Firebug when Firefox window is opened.
	*/
	initialize: function(prefDomain, prefNames) {
		Firebug.Module.initialize.apply(this, arguments);
	},
	
	initializeUI: function(detachArgs) {
		Firebug.Module.initializeUI.apply(this, arguments);
	},
	
	/**
	* Called by Firebug when Firefox window is closed.
	*/
	//shutdown: function() { },
	
	/**
	* Called when a new context is created but before the page is loaded.
	*/
	//initContext: function(context, persistedState) { },
	
	//reattachContext: function(browser, context) { },
	
	//destroyContext: function(context, persistedState) { },
	
	//watchWindow: function(context, win) { },

	//unwatchWindow: function(context, win) { },
	
	//showContext: function(browser, context) { },

	/*loadedContext: function(context) {
		this.onObserverChange(null);
	},*/
	
	showPanel: function(browser, panel) {
		var isPanel = panel && panel.name == panelName;
		collapse(Firebug.chrome.$("fbFlashbugFlashButtons"), !isPanel);
        collapse(Firebug.chrome.$("fbFlashbugVersion"), !isPanel);
		
		if (isPanel) {
			// Append CSS
			var doc = panel.document;
			if ($("flashbugFlashStyles", doc)) {
				// Don't append the stylesheet twice. 
			} else {
				var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/inspector.css");
				styleSheet.setAttribute("id", "flashbugFlashStyles");
				addStyleSheet(doc, styleSheet);
			}
			
			//this.enableSWFIO(getTabBrowser().contentDocument);
		}
	},
	
	//showSidePanel: function(browser, sidePanel) { },
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

	//updateOption: function(name, value) { },

	//getObjectByURL: function(context, url) { },
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// intermodule dependency

	// caller needs module. win maybe context.window or iframe in context.window.
	// true means module is ready now, else getting ready
	//isReadyElsePreparing: function(context, win) { },
	
	///////////////////////////////////////
	// Firebug Activable Module Override //
	///////////////////////////////////////
	
	//enabled: false,
	//observers: null,
	//dependents: null,
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Observers (dependencies)

	/*hasObservers: function() {
		return Firebug.ActivableModule.hasObservers.apply(this, arguments);
	},*/

	/*addObserver: function(observer) {
		Firebug.ActivableModule.addObserver.apply(this, arguments);
	},*/

	/*removeObserver: function(observer) {
		Firebug.ActivableModule.removeObserver.apply(this, arguments);
	},*/

	/**
	 * This method is called if an observer (e.g. {@link Firebug.Panel}) is added or removed.
	 * The module should decide about activation/deactivation upon existence of at least one
	 * observer.
	 */
	onObserverChange: function(observer) {
		Firebug.ActivableModule.onObserverChange.apply(this, arguments);
		
		if (this.hasObservers()) {
			this.enableSWFIO(getTabBrowser().contentDocument);
		} else {
			this.disableSWFIO(getTabBrowser().contentDocument);
		}
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Firebug Activation

	// Called before any suspend actions. First caller to return true aborts suspend.
	//onSuspendingFirebug: function() { },

	// When the number of activeContexts decreases to zero. Modules should remove listeners, disable function that takes resources
	//onSuspendFirebug: function() { },

	// When the number of activeContexts increases from zero. Modules should undo the work done in onSuspendFirebug
	//onResumeFirebug: function() { },

	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Module enable/disable APIs.
	
	/*isEnabled: function() {
		return Firebug.ActivableModule.isEnabled.apply(this, arguments);
	},*/

	/*isAlwaysEnabled: function() {
		return Firebug.ActivableModule.isAlwaysEnabled.apply(this, arguments);
	}*/
	
	///////////////////////////////
	// Firebug Callback Override //
	///////////////////////////////
	
	//enable: function(FirebugChrome) { },
	//disable: function(FirebugChrome) { },
	//onSourceFileCreated: function(context, sourceFile) { },
	
	internationalizeUI: function(doc) {
		trace("internationalizeUI");
        var elements = ["flbInspect", "fbFlashbugVersion", "fbFlashbugDownload", "flbVersion"];
        var attributes = ["label", "tooltiptext", "value"];
		
        Flashbug.internationalizeElements(doc, elements, attributes);
    },

	////////////////////////
	// Inspector Specific //
	////////////////////////
	
	swfIOEnabled: false,
	isInspecting: false,
	dispatchName: $FL_STR('flashbug.inspPanel.title'),
	description: $FL_STR("flashbug.inspPanel.description"),
	
	isValidFlashPlayer:function() {
		var plugin = navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin;
		if (!plugin) return false;
		
		var versionArray = plugin.description.match(/[\d.]+/g);
		if (!versionArray) return false;
		
		// Min version is 9.0.115.0
		if (versionArray.length >= 1 && !isNaN(versionArray[0])) {
			var major = parseFloat(versionArray[0]);
			if (major < 9) return false;
			if (major > 9) return true;
			
			if (versionArray.length >= 2 && !isNaN(versionArray[1])) {
				var minor = parseFloat(versionArray[1]);
				if (minor < 115) return false;
				return true;
			}
			return false;
		}
		
		return false;
	},
	
	toggleInspect: function() {
		if (!this.isInspecting) {
			this.toggleButton(true);
			this.send({ command:"startInspect" });
		} else {
			this.toggleButton(false);
			this.send({ command:"stopInspect" });
		}
	},
	
	toggleButton: function(enabled) {
		this.isInspecting = enabled;
		Firebug.chrome.$("flbInspect").checked = enabled;
	},
	
	setAClass: function(node, className, swfTitle) {
		if (swfTitle == undefined) swfTitle = false;
		function isSWFTitle(node) {
			if (node.localName == 'a' && node.parentNode.getAttribute('rel')) return true;
			return false;
		};
		
		var nodeList = node.ownerDocument.getElementsByClassName(className),
			i = nodeList.length;
		while(i--) {
			if (isSWFTitle(nodeList[i]) == swfTitle) removeClass(nodeList[i], className);
		}
		if (isSWFTitle(node) == swfTitle) setClass(node, className);
	},
	
	setLIClass: function(node, className) {
		var nodeList = node.ownerDocument.getElementsByClassName(className),
			i = nodeList.length;
		while(i--) {
			removeClass(nodeList[i], className);
		}
		
		for (var parent = node; parent; parent = parent.parentNode) {
			if (parent.localName == 'li' && parent != node) setClass(parent, className);
		}
	},
	
	getBase: function() {
		return $('base', Flashbug.getContext().getPanel(panelName).panelNode.ownerDocument);
	},
	
	getSWF: function(id) {
		var panel = Flashbug.getContext().getPanel(panelName);
		return getElementsByXPath(panel.panelNode.ownerDocument, '//li[@rel="' + id + '"]')[0];
	},
	
	getXPath: function(id, target) {
		var arr = target.split('.'),
			xpath = '//li[@rel="' + id + '"]';
		for (var i = 0, l = arr.length; target && i < l; i++) {
			xpath += '/ul/li[' + (+arr[i] + 1) + ']';
		}
		return xpath;
	},
	
	getIndexPath: function(target) {
		var arr = [],
			o = {};
		target = target.parentNode;
		while (target && !target.hasAttribute('rel')) {
			if(target.localName == 'li') {
				var idx = -1,
					sibling = target;
				while (sibling) {
					idx++;
					sibling = sibling.previousSibling;
				}
				arr.push(idx);
			}
			target = target.parentNode;
		}
		
		arr.reverse();
		//arr.shift();
		o.name = arr.join("."); // name
		o.id = target.getAttribute('rel'); // swf id
		return o;
	},
	
	selectSWF: function(id) {
		this.send({
			command:'selectSWF',
			id: id
		});
		
		var liNode = this.getSWF(id);
		toggleClass(liNode, 'opened');
		this.setAClass(liNode.childNodes[1], 'selected', true);
	},
	
	
	addScript: function(doc, id, script) {
		var el = doc.createElementNS('http://www.w3.org/1999/xhtml', 'html:script');
		el.setAttribute('type', 'text/javascript');
		el.setAttribute('id', id);
		el.firebugIgnore = true;
		el.innerHTML = 'try {' + script + '} catch(e) { console.log("addScript Error: " + e); };';
		if (doc.documentElement) doc.documentElement.appendChild(el);
		
		return el;
	},
	
	runFile: function(doc, src) {
		var script = getResource(src),
			el = this.addScript(doc, '___SWFIO', script);
		el.parentNode.removeChild(el);
	},
	
	runScript: function(doc, script) {
		var el = this.addScript(doc, '___SWFIOInPage', script);
		el.parentNode.removeChild(el);
	},
	
	injectFlash: function(doc) {
		doc.addEventListener("SWFEvent", this.load, false, true);
		if (doc['flashIsInjected']) {
			trace('call start from flashpanel');
			this.runScript(doc, '___Flashbug_start();');
		} else {
			trace('***inject swfio***', doc);
			this.runFile(doc, "chrome://flashbug/content/lib/SWFIO.js");
			doc['flashIsInjected'] = true;
		}
	},
	
	enableSWFIO: function(doc) {
		trace("enableSWFIO");
		
		this.injectFlash(doc);
		
		var iframes = doc.getElementsByTagName('iframe');
		for (var i = -1, len = iframes.length; ++i < len;) {
			this.injectFlash(iframes[i].contentDocument);
		}
		
		this.swfIOEnabled = true;
	},
	
	disableSWFIO: function(doc) {
		trace("disableSWFIO");
		var script = '___Flashbug_stop()';
		doc.removeEventListener("SWFEvent", this.load, false);
		//doc.removeEventListener("DOMNodeInserted", this.onMutateNode, false);
		this.runScript(doc, script);
		
		var iframes = doc.getElementsByTagName('iframe');
		for (var i = -1, len = iframes.length; ++i < len;) {
			iframes[i].contentDocument.removeEventListener("SWFEvent", this.load, false);
			this.runScript(iframes[i].contentDocument, script);
		}
		
		this.swfIOEnabled = false;
	},
	
	onMutateNode: function(event) {
		var tag = event.target.localName;
		if (tag == 'object' || tag == 'embed') trace(tag, event.target);
	},
	
	load: function(event) {
		if (event.target.ownerDocument.defaultView.top.document == getTabBrowser().contentDocument) {
			
			var data = event.target.getUserData('flashbug');
			try {
				// Fix external interface parsing
				//data = data.replace(/%5c/g, "\\");
				data = unescape(data);
				data = data.replace(/∂/g, '\r');
				data = data.replace(/‰/g, '\n');
				data = JSON.parse(data);
			
				// command:ready, id:flash, name:preloader.swf, url:http:/// preloader.swf
				var command = data.command,
					panel = Flashbug.getContext().getPanel(panelName);
				var args = data.args ? data.args.slice() : [];
				args.unshift(data.id);
				//if (command != 'appendTree' && command != 'appendLeaf') trace('load args ' + command, data);
				try{
					if (panel[command]) panel[command].apply(panel, args);
				} catch(e) {
					ERROR('ERROR - ' + command + '(' + args + ')', e)
				}
			
			} catch(e) {
				ERROR(e);
			}
		}
	},
	
	send: function(data) {
		//if (data.command != 'removeOverlay' && data.command != 'overlayObject') trace('send args ' + data.command, data);
		if(!this.swfIOEnabled) return;
		
		var id = data.id;
		data = JSON.stringify(data);
		data = data.replace(/\r/g, '∂');
		data = data.replace(/\n/g, '‰');
		data = escape(data);
		// current document
		var scriptID = "if (Flashbug) Flashbug.send('" + data + "','" + id + "');";
		var script   = "if (Flashbug) Flashbug.send('" + data + "');";
		this.runScript(getTabBrowser().contentDocument, id ? scriptID : script);
		
		// iframes
		var iframes = getTabBrowser().contentDocument.getElementsByTagName("iframe");
		for (var i = -1, len = iframes.length; ++i < len;) {
			this.runScript(iframes[i].contentDocument, id ? scriptID : script);
		}
	}
});

Flashbug.FlashModule.WarningRep = domplate(Firebug.Rep, {
    tag:
        DIV({"class": "disabledPanelBox disabledPanelBoxIcon"},
            H1({"class": "disabledPanelHead"},
                SPAN("$pageTitle")
            ),
            P({"class": "disabledPanelDescription", style: "margin-top: 15px;"},
                SPAN("$suggestion")
            )
        )
});

Flashbug.FlashModule.Root = domplate(Firebug.Rep/*FirebugReps.Element*/, {
    tag:
        UL({'class':'tree', id:'$id'}),
});

Flashbug.FlashModule.SWF = domplate(Firebug.Rep, {
    tag:
        LI({rel:'$id'},
			IMG({"class": "twisty2"}),
			A({href:'#', title:'$url', 'class':'swf', onmousedown: "$onMouseDown"}, '$name')
		),
		
	onMouseDown: function(event) {
		var tag = event.target.parentNode;
		Flashbug.FlashModule.send({
			command:'selectSWF',
			id: tag.getAttribute('rel')
		});
	}
});

Flashbug.FlashModule.Base = domplate(Firebug.Rep, {
	trace:trace,
	
	getClass: function(obj) {
		return obj.packageName.indexOf('flash') == 0 || obj.packageName.indexOf('fl.') == 0 ? obj.className : obj.baseClassName;
	},
	
	getTitle: function(obj) {
		return obj.packageName.indexOf('flash') != -1 ? obj.packageName + '::' + obj.className : obj.packageName + (obj.className ? '::' + obj.className : '') + ' (' + obj.basePackageName + '::' + obj.baseClassName + ')';
	}
});

Flashbug.FlashModule.Leaf = domplate(Flashbug.FlashModule.Base, {
    tag:
        LI({'class':'$classInfo.basePackageName'},
			IMG({"class": "twisty2"}),
			A({href:'#', title:'$classInfo|getTitle', 'class':'$classInfo|getClass'}, '$name')
		)
});

Flashbug.FlashModule.Tree = domplate(Flashbug.FlashModule.Base, {
    tag:
        UL({"class":'tree'},
			FOR("item", "$array",
				LI({'class':'$item.classInfo.basePackageName $item.hasChildren|addChildrenClass'},
					IMG({"class": "twisty2"}),
					A({href:'#', title:'$item.classInfo|getTitle', 'class':'$item.classInfo|getClass'}, '$item.name')
				)
			)
		),
		
	addChildrenClass: function(hasChildren) {
		if (hasChildren) return 'hasChildren';
		return '';
	}
});


// Panel Implementation
//-----------------------------------------------------------------------------
/*
SWF URL
Class / Package / Cumulative Instance / Instances / Cumulative Memory / Memory

Class-Package / Add / Del / Current / Cumul
*/
function FlashPanel() { }
FlashPanel.prototype = extend(Firebug.ActivablePanel, {
	
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Inspector Panel																		  //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	////////////////////////////
	// Firebug Panel Override //
	////////////////////////////
	
	initialize: function(context, doc) {
		this.panelSplitter = $("fbPanelSplitter");
		this.sidePanelDeck = $("fbSidePanelDeck");
		
		this.onClick = bind(this.onClick, this);
		this.onMouseOver = bind(this.onMouseOver, this);
        this.onMouseDown = bind(this.onMouseDown, this);
		this.onMouseOut = bind(this.onMouseOut, this);
		
		Firebug.ActivablePanel.initialize.apply(this, arguments);
	},
	
	// Called at the end of module.initialize; addEventListener-s here
	initializeNode: function(panelNode) {
		this.panelNode.addEventListener("click", this.onClick, false);
        this.panelNode.addEventListener("mousedown", this.onMouseDown, false);
		this.panelNode.addEventListener("mouseover", this.onMouseOver, false);
		this.panelNode.addEventListener("mouseout", this.onMouseOut, false);
		
		this.showVersion();
	},
	
	destroyNode: function() {
		this.panelNode.removeEventListener("click", this.onClick, false);
        this.panelNode.removeEventListener("mousedown", this.onMouseDown, false);
		this.panelNode.removeEventListener("mouseover", this.onMouseOver, false);
		this.panelNode.removeEventListener("mouseout", this.onMouseOut, false);
	},
	
	// this is how a panel in one window reappears in another window; lazy called
	reattach: function(doc) {
		this.showVersion();
		Firebug.ActivablePanel.reattach.apply(this, arguments);
	},
	
	// persistedPanelState plus non-persisted hide() values
	show: function(state) {
		this.showToolbarButtons("fbFlashbugVersion", true);
		
		// If pane has data, enable inspector
		if (Flashbug.FlashModule.isValidFlashPlayer() && document.getElementsByTagName('ul').length == 0) {
			/*var mm = Flashbug.readMMFile();
			if (mm['PreloadSwf'] != Flashbug.profilerPath) {
				var args = {
					pageTitle: $FL_STR("flashbug.inspPanel.mm.warning"),
					suggestion: $FL_STR("flashbug.inspPanel.mm.suggestion")
				}
				Flashbug.FlashModule.WarningRep.tag.replace(args, this.panelNode, this);
			} else {*/
				Flashbug.FlashModule.onObserverChange(null);
			//}
		} else {
			var args = {
				pageTitle: $FL_STR("flashbug.inspPanel.player.warning"),
				suggestion: $FL_STR("flashbug.inspPanel.player.suggestion")
			}
			Flashbug.FlashModule.WarningRep.tag.replace(args, this.panelNode, this);
		}
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
				label: $FL_STR("flashbug.options.pref"),
				nol10n: true,
				type: "button",
				command: function() {
					context.chrome.window.openDialog("chrome://flashbug/content/preferences.xul", "flashbugPreferences", "chrome,titlebar,toolbar,centerscreen,modal");
				}
			}
		];
	},
	
	onActivationChanged: function(enable) {
		if (enable) {
			Flashbug.FlashModule.addObserver(this);
		} else {
			Flashbug.FlashModule.removeObserver(this);
		}
		//Flashbug.initMMFile(true);
	},
	
	////////////////////////
	// Inspector Specific //
	////////////////////////
	
	name: panelName,
	title: $FL_STR('flashbug.inspPanel.title'),
	searchable: true,
	//inspectable: true,
   // breakable: false,
   // inspectorHistory: new Array(5),
	order: 80,
	
	showVersion: function() {
		var version = Flashbug.playerVersion;
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = version;
	},
	
	onClick: function(event) {
		if (!isLeftClick(event)) return;
		
        if (event.detail == 2) {
            // The double-click (detail == 2) expands an HTML element, but the user must click
            // on the element itself not on the twisty.
            // The logic should be as follow:
            // - click on the twisty expands/collapses the element
            // - double click on the element name expands/collapses it
            // - click on the element name selects it
			var target = event.target;
            if (!hasClass(target, "twisty2") && target.localName == 'a') {
				 toggleClass(target.parentNode, 'opened');
			}
        }
    },
	
	onMouseOver: function(event) {
		var target = event.target;
		if (target.localName == 'a' && !hasClass(target, 'swf')) {
			var o = Flashbug.FlashModule.getIndexPath(target);
			Flashbug.FlashModule.send({
				command:'overlayObject',
				id: o.id,
				/* target */
				args:[ o.name ]
			});
		}
    },
	
	onMouseOut: function(event) {
		var target = event.target;
		if (target.localName == 'a' && !hasClass(target, 'swf')) {
			var o = Flashbug.FlashModule.getIndexPath(target);
			Flashbug.FlashModule.send({
				command:'removeOverlay',
				id: o.id
			});
		}
    },

    onMouseDown: function(event) {
        if (!isLeftClick(event)) return;
		
		var target = event.target;
		if (target.localName == 'a' && !hasClass(target, 'swf')) {
			var isSWFTitle = false;
			if (target.parentNode.getAttribute('rel')) isSWFTitle = true;
			Flashbug.FlashModule.setAClass(target, 'selected', isSWFTitle);
			var o = Flashbug.FlashModule.getIndexPath(target);
			Flashbug.FlashModule.send({
				command:'selectObject',
				id: o.id,
				/* target */
				args:[ o.name ]
			});
		}
		if (hasClass(target, "twisty2")) {
			var o = Flashbug.FlashModule.getIndexPath(target);
			Flashbug.FlashModule.send({
				command:'getLeafTree',
				id: o.id,
				/* target */
				args:[ o.name ]
			});
			toggleClass(target.parentNode, 'opened');
		}
    },
	
	highlightLeaf: function(id, path, className) {
		Firebug.toggleBar(true, panelName);
       	Firebug.chrome.selectPanel(panelName);
        this.panelNode.focus();
		
		var xpath = Flashbug.FlashModule.getXPath(id, path),
			liNode = getElementsByXPath(this.panelNode.ownerDocument, xpath)[0];
		
		Flashbug.FlashModule.setLIClass(liNode, 'opened');
		Flashbug.FlashModule.setAClass(liNode.childNodes[1], className, false);
		
		liNode.scrollIntoView(true);
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Profiler Commands
	
	ready: function(id, name, url) {
		trace('ready ' + id + ' ; ' + name + ' ; ' + url, this.panelNode);
		
		// If tree is already found skip
		var liNode = this.panelNode.querySelector('#base li[rel="' + id + '"]');
		if (liNode) {
			// Has a different swf loaded into save object?
			var aNode = liNode.childNodes[1];
			if (aNode.getAttribute('title') != url) {
				aNode.setAttribute('title', url);
				aNode.innerHTML = name;
			}
			return;
		}
		
		// Add base UL
		var baseTag = this.panelNode.querySelector('#base');
		if (!baseTag) baseTag = Flashbug.FlashModule.Root.tag.replace({id:'base'}, this.panelNode, Flashbug.FlashModule.Root);
		
		// Add swf
		Flashbug.FlashModule.SWF.tag.append({id:id, name:name, url:url}, baseTag, Flashbug.FlashModule.SWF);
	},
	
	wait: function(id) {
		trace('wait');
		var el = Flashbug.FlashModule.getSWF(id);
		setClass(el, 'wait');
	},
	
	resume: function(id) {
		trace('resume');
		var el = Flashbug.FlashModule.getSWF(id);
		removeClass(el, 'wait');
	},
	
	appendTree: function(id, tree, path) {
		var doc = this.panelNode.ownerDocument,
			xpath = Flashbug.FlashModule.getXPath(id, path),
			target = getElementsByXPath(doc, xpath)[0];
			
		// No target to append yet? skip
		if (!target) {
			this.updateTree(id, path);
			return;
		}
		
		if (tree.length) {
			// emulates replaceWith
			var div = doc.createElement('div');
			Flashbug.FlashModule.Tree.tag.append({array:tree}, div, Flashbug.FlashModule.Tree);
			
			if (target.getElementsByTagName('ul').length) {
				target.replaceChild(div.firstChild, target.childNodes[2]);
			} else {
				target.appendChild(div.firstChild);
			}
			setClass(target, 'hasChildren');
		} else {
			removeClass(target, 'hasChildren');
		}
	},
	
	removeLeaf:function(id, path, name) {
		var doc = this.panelNode.ownerDocument,
			xpath = Flashbug.FlashModule.getXPath(id, path);
		xpath += "/ul/li/a[contains(text(), '" + name + "')]";
		var aNode = getElementsByXPath(doc, xpath)[0];
		
		// No target to remove yet? skip
		if (!aNode) {
			path += '.null'; // something just to be removed
			this.updateTree(id, path);
			return;
		}
		
		var liNode = aNode.parentNode;
		var ulNode = liNode.parentNode;
		if (ulNode.getElementsByTagName('li').length == 1) {
			removeClass(ulNode.parentNode, 'hasChildren');
			removeClass(ulNode.parentNode, 'isOpened');
			eraseNode(ulNode);
		} else {
			eraseNode(liNode);
		}
	},
	
	updateTree: function(id, path) {
		// Go up ancestors til we find a match, and update tree
		var doc = this.panelNode.ownerDocument,
			xpath, target,
			newPath = path.split('.');
		newPath.pop();
		newPath = newPath.join('.');
		//while(!target) {
			xpath = Flashbug.FlashModule.getXPath(id, newPath);
			target = getElementsByXPath(doc, xpath)[0];
		/*	newPath = newPath.split('.');
			newPath.pop();
			newPath = newPath.join('.');
		}*/
		
		if (target) {
			var o = Flashbug.FlashModule.getIndexPath(target);
			Flashbug.FlashModule.send({
				command:'getLeafTree',
				id: o.id,
				/* target */
				args:[ o.name ]
			});
		}
	},
	
	appendLeaf:function(id, name, index, className, path) {
		var doc = this.panelNode.ownerDocument,
			xpath = Flashbug.FlashModule.getXPath(id, path),
			target = getElementsByXPath(doc, xpath)[0];
		
		// Doesn't exist yet?
		if (!target) {
			this.updateTree(id, path);
			return;
		}
		
		if (target.getElementsByTagName('ul').length == 0) Flashbug.FlashModule.Root.tag.append({id:''}, target, Flashbug.FlashModule.Root);
		
		var ul = target.getElementsByTagName('ul')[0],
			o = {name:name, classInfo:className},
			idx = Number(index);
		if (idx >= ul.childNodes.length) {
			Flashbug.FlashModule.Leaf.tag.append(o, ul, Flashbug.FlashModule.Leaf);
		} else {
			Flashbug.FlashModule.Leaf.tag.insertBefore(o, ul.childNodes[idx], Flashbug.FlashModule.Leaf);
		}
		
		setClass(target, 'hasChildren');
	},
	
	mouseOverLeaf: function(id, path) {
		this.highlightLeaf(id, path, 'hovered');
	},
	
	mouseOutLeaf: function(id) {
		var nodeList = this.panelNode.ownerDocument.getElementsByClassName('hovered'),
			i = nodeList.length;
		while(i--) {
			removeClass(nodeList[i], 'hovered');
		}
	},
	
	selectLeaf: function(id, path) {
		this.mouseOutLeaf(id);
		this.highlightLeaf(id, path, 'selected');
	},
	
	updateLeaf:function(id, target, targetName, targetPath, classInfo, inheritInfo, targetProperties, targetVariables) {
		var panel = Flashbug.getContext().getPanel(apiPanel);
		panel.update(id, target, targetName, targetPath, classInfo, inheritInfo, targetProperties, targetVariables);
	},
	
	updateSWF:function(id, swfName, swfURL, swfVersion, swfSize, swfProperties, swfVariables) {
		var panel = Flashbug.getContext().getPanel(apiPanel);
		panel.updateSWF(id, swfName, swfURL, swfVersion, swfSize, swfProperties, swfVariables);
	},
	
	stopInspect: function(id) {
		Flashbug.FlashModule.toggleButton(false);
	},
});


//////////////////////////
// Firebug Registration //
//////////////////////////

Firebug.FlashModule = Flashbug.FlashModule;
Firebug.registerActivableModule(Flashbug.FlashModule);
Firebug.registerPanel(FlashPanel);

/////////////////////////////
// Firebug Trace Constants //
/////////////////////////////

FBTrace.DBG_FLASH_INSPECTOR = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_INSPECTOR");

}});