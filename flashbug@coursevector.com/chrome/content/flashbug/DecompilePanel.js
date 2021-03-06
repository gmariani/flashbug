FBL.ns(function() { with (FBL) {

// Constants
const panelName = "flbDecompiler";
const observerSvc = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
// side panels
const treePanel = "flbDecompilerTree";

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;

var trace = function(msg, obj) {
	msg = "Flashbug - Flash::" + msg;
	if (FBTrace.DBG_FLASH_DECOMPILER) {
		if (typeof FBTrace.sysout == "undefined") {
			Flashbug.alert(msg + " | " + obj);
		} else {
			try {
				FBTrace.sysout(msg, obj);
			} catch(e) {
				alert(e);
			}
		}
	}
}

// ************************************************************************************************
// Array Helpers

function cloneMap(map) {
    var newMap = [];
    for (var item in map) {
        newMap[item] = map[item];
	}
        
    return newMap;
}

// Helper array for prematurely created contexts
var contexts = new Array();

// Module Implementation
//-----------------------------------------------------------------------------

Flashbug.DecompileModule = extend(Firebug.ActivableModule, {
	
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
		Firebug.NetMonitor.removeListener(this);
    },
	
	/**
	* Called when a new context is created but before the page is loaded.
	*/
	initContext: function(context, persistedState) {
		var tabId = Firebug.getTabIdForWindow(context.window);
		
		// Create sub-context for swfs. The swfs object exists within the context even if the panel is disabled
        context.swfs = {};
		context.length = 0;
		
		// The temp context isn't created e.g. for empty tabs, chrome pages.
        var tempContext = contexts[tabId];
        if (tempContext) {
            this.destroyTempContext(tempContext, context);
            delete contexts[tabId];
        }
    },
	
	//reattachContext: function(browser, context) { },
	
	destroyContext: function(context) {
		for (var p in context.swfs) {
            delete context.swfs[p];
		}
		
        delete context.swfs;
    },
	
	//watchWindow: function(context, win) { },

	//unwatchWindow: function(context, win) { },
	
	//showContext: function(browser, context) { },

	/*loadedContext: function(context) {
		this.onObserverChange(null);
	},*/
	
	showPanel: function(browser, panel) {
		var isPanel = panel && panel.name == panelName;
		//collapse(Firebug.chrome.$("fbFlashbugDecompileButtons"), !isPanel);
        collapse(Firebug.chrome.$("fbFlashbugVersion"), !isPanel);
		
		if (isPanel) {
			var side = Flashbug.getContext().getPanel(treePanel);
			Flashbug.DecompileTreeModule.showPanel(browser, side);
			
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
			// Enable Listeners?
		} else {
			// Remove Listeners?
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
        var elements = ["flbInspect", "fbFlashbugVersion", "fbFlashbugDownload", "flbVersion"];
        var attributes = ["label", "tooltiptext", "value"];
		
        Flashbug.internationalizeElements(doc, elements, attributes);
    },

	////////////////////////
	// Inspector Specific //
	////////////////////////
	
	dispatchName: $FL_STR('flashbug.decPanel.title'),
	description: $FL_STR("flashbug.decPanel.description"),
	
	destroyTempContext: function(tempContext, context) {
        if (!tempContext) return;
		
		context.swfs = cloneMap(tempContext.swfs);

        delete tempContext.swfs;
    },
	
	onResponse: function(context, file) {
		//trace("onResponse");
		this.addSWF(context, file, file.request.URI.asciiSpec);
	},
	
	onCachedResponse: function(context, file) {
		//trace("onCachedResponse");
		this.addSWF(context, file, file.request.URI.asciiSpec);
	},
	
	onExamineResponse: function(context, request) {
		//trace("onExamineResponse");
		this.addSWF(context, request, request.URI.asciiSpec);
	},
	
	onExamineCachedResponse: function(context, request) {
		//trace("onExamineCachedResponse");
		this.addSWF(context, request, request.URI.asciiSpec);
	},
	
	addSWF: function(context, file, href) {
		// Get MIME Type
		var request = file.hasOwnProperty('request') ? file.request : file;
		
		
		var mimeType = Firebug.NetMonitor.Utils.getMimeType(safeGetContentType(request), href);
		if (mimeType == null) {
			var ext = getFileExtension(request.name);
			if (ext) {
				var extMimeType = ext.toLowerCase() == 'spl' ? Flashbug.SPL_MIME : ext.toLowerCase() == 'swf' ? Flashbug.SWF_MIME : null;
				if (extMimeType) mimeType = extMimeType;
			}
		}
		
		var tabId = Firebug.getTabIdForWindow(context.window);

		// Create temporary context
		if (!contexts[tabId]) {
			var tempContext = {tabId:tabId, swfs:{}, length:0 };
			contexts[tabId] = tempContext;
		}

        // Use the temporary context first, if it exists. There could be an old
        // context (associated with this tab) for the previous URL.
        var context2 = contexts[tabId];
        context2 = context2 ? context2 : context;
		
		// For some reason this isn't always available
		
		if (!context2.hasOwnProperty("swfs")) {
			context2.swfs = {};
			context2.length = 0;
		}
		
		// If is a SWF
		if (mimeType == Flashbug.SWF_MIME || mimeType == Flashbug.SPL_MIME) {
			var hasAdded = false,
				isFirst = (context2.length == 0);
			
			if (!context2.swfs[href]) {
				context2.swfs[href] = file;
				context2.length++;
				hasAdded = true;
				trace("addSWF: " + href, context2.swfs[href]);
			}
			
			// Refresh the panel asynchronously.
			if(hasAdded && context instanceof Firebug.TabContext) {
				if (isFirst) {
					context.invalidatePanels(panelName);
				} else {
					context.getPanel(treePanel).append(file);
				}
			}
		}
	},
	
	showDetails: function(item) {
		var panel = Flashbug.getContext().getPanel(panelName);
		panel.showDetails(item);
	}
});

Flashbug.DecompileModule.SWF = domplate(Firebug.Rep, {
	hasData: function(obj) {
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		if(value.data) return '';
		return 'flb-dec-hidden';
	},
	
	capitalize: function(string) {
		string = string != null ? string.toString() : '';
		return string ? string.charAt(0).toUpperCase() + string.slice(1) : '';
	},
	
	zero: function(n) {
		if (n.length < 2) return '0' + n;
		return n;
	},
	
	getHex: function(color) {
		var str = '#';
		str += this.zero(color.red.toString(16));
		str += this.zero(color.green.toString(16));
		str += this.zero(color.blue.toString(16));
		if (color.hasOwnProperty('alpha')) str += this.zero((color.alpha * 255).toString(16));
		return str.toUpperCase();
		
		/*if (color.hasOwnProperty('alpha')) {
			str = (color.alpha << 24) | (color.red << 16) | (color.green << 8) | color.blue;
		} else {
			str = (color.red << 16) | (color.green << 8) | color.blue;
		}
		return '#' + str.toString(16).toUpperCase();*/
	},
    
	getColor: function(color) {
		if (color.hasOwnProperty('alpha')) return 'rgba(' + [color.red, color.green, color.blue, color.alpha] + ')';
		return 'rgb(' + [color.red, color.green, + color.blue] + ')';
	},
	
	getFileSize: function(obj) {
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		if (value.hasOwnProperty('svgHeader')) {
			var data = value.svgHeader + value.data;
			return formatSize(data.length);
		}
		if (value.hasOwnProperty('data')) return formatSize(value.data.length);
		return formatSize(value.dataSize);
	},
	
	getParamName: function(param) {
        var name = param.name;
        var limit = Firebug.netParamNameLimit;
        if (limit <= 0) return name;
        if (name.length > limit) name = name.substr(0, limit) + "...";
        return name;
    },
	
	getTag: function(obj) {
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		return value.tag + ' (' + value.id + ')';
	},
	
	getSize: function(obj) {
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		return (value.bounds.right - value.bounds.left).toFixed(2) + ' x ' + (value.bounds.bottom - value.bounds.top).toFixed(2);
	},
	
	getUnsupportedTag: function(obj) {
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		var ext = this.getFileExt(obj);
		
		if(ext == 'jpg' || ext == 'png' || ext == 'gif' || (ext == 'flv' && value.codecID <= 5) || (ext == 'wav' && (value.soundFormat == 0 || value.soundFormat == 3)) || ext == 'mp3') return this.emptyTag;
		
		// For current bug in defineShape
		if (ext == 'svg' && value.data.indexOf('d="undefined"') == -1) return this.emptyTag;
		return this.unsupportedTag;
	},
	
	getParamValueIterator: function(param) {
        // This value is inserted into CODE element and so, make sure the HTML isn't escaped (1210).
        // This is why the second parameter is true.
        // The CODE (with style white-space:pre) element preserves whitespaces so they are
        // displayed the same, as they come from the server (1194).
        // In case of a long header values of post parameters the value must be wrapped (2105).
        return wrapText(param, true);
    },
	
	emptyTag:
		DIV({'class': 'flb-dec-hidden'}, ''),
		
	unsupportedTag:
		DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-unsupported'}, 'Not fully supported'),
	
	onSave: function(event) {
        var obj = event.target.repObject;
		if(!obj) {
			trace('onSave - Can\'t find data object!');
			return;
		}
		
		// Create file
		var dir = Cc['@mozilla.org/file/directory_service;1'].getService(Ci.nsIProperties);
		var file = this.getTargetFile(this.getFileName(obj));
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		var data = value.data;
		if (value.type == 'Shape' || value.type == 'Morph') data = value.svgHeader + data;
		if (file) Flashbug.writeFile(file, data);
		
        cancelEvent(event);
    },
	
	getTargetFile: function(defaultFileName) {
        var nsIFilePicker = Ci.nsIFilePicker;
        var fp = CCIN('@mozilla.org/filepicker;1', 'nsIFilePicker');
        fp.init(window, null, nsIFilePicker.modeSave);
        fp.appendFilter('Image Files','*.jpg, *.bmp, *.png, *.gif, *.jpeg');
        fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
        fp.filterIndex = 1;
        fp.defaultString = defaultFileName;
		
        var rv = fp.show();
        if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) return fp.file;
		
        return null;
    },
	
	getFileName: function(obj) {
		var ext = this.getFileExt(obj);
		var fullName = obj.name;
		return ext ? fullName + '.' + ext : fullName;
	},
	
	getFileExt: function(obj) {
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		if(value.hasOwnProperty('imageType')) {
			if(value.imageType == 'JPEG') return 'jpg';
			if(value.imageType == 'PNG') return 'png';
			if(value.imageType == 'GIF89a') return 'png';
			return '?';
		}
		
		if(value.hasOwnProperty('soundFormat') || value.hasOwnProperty('streamSoundCompression')) {
			var prop = value.hasOwnProperty('soundFormat') ? 'soundFormat' : 'streamSoundCompression';
			if(value[prop] == 0) return 'wav';
			if(value[prop] == 1) return 'wav';
			if(value[prop] == 2) return 'mp3';
			if(value[prop] == 3) return 'wav';
			if(value[prop] == 4) return 'nel';
			if(value[prop] == 5) return 'nel';
			if(value[prop] == 6) return 'nel';
			if(value[prop] == 11) return 'speex';
			return '?';
		}
		
		if(value.isPBJ) return 'pbj';
		if(value.isSWF) return 'swf';
		if(value.isXML) return 'xml';
		if(value.isGIF) return 'gif';
		
		if(value.type == 'Font') return 'cff';
		if(value.type == 'Video') return 'flv';
		if(value.type == 'Shape' || value.type == 'Morph') return 'svg';
		
		return 'bin';
	},
});

Flashbug.DecompileModule.Binary = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name')
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
						TR({},
							TD({'class': 'netInfoParamName'}, SPAN('Data')),
							TD({'class': 'netInfoParamValue'},
								CODE({}, '$param.value.data')
							)
						),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		)
});

Flashbug.DecompileModule.PixelBender = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name')
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Vendor')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.pbMetadata.vendor')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Namespace')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.pbMetadata.namespace')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Version')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.pbMetadata.version')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Description')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.pbMetadata.description')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		)
});

Flashbug.DecompileModule.Bitmap = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name')
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					TR({},
						TD({'class': 'netInfoParamValue', colSpan:2},
							DIV({'class': 'flb-dec-image-box'},
								IMG({src: '$param|getValue', _param:'$param', onload: '$onLoadImage'})
							)
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN($FL_STR('flashbug.netInfoSWF.dimensions'))),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow dimensions'}, '$param|getDimensions')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Has Alpha?')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getAlpha')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Image Type')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.imageType')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Color Table Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getColorTable')
						)
					),
					
					
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		),
		
	getColorTable: function(obj) {
		if (obj.value.colorTableSize) return obj.value.colorTableSize;
		return '-';
	},
	
	getAlpha: function(obj) {
		if (obj.value.withAlpha) return 'True';
		if (obj.value.alphaData) return 'True';
		return 'False';
	},
	
	getDimensions: function(obj) {
		return obj.value.width + ' x ' + obj.value.height;
	},
		
	onLoadImage: function(event) {
		var img = event.currentTarget,
			w = img.naturalWidth, 
			h = img.naturalHeight,
			obj = img.param.value;
		
		// Mix-in alpha data
		if (obj.alphaData && !obj.hasAlpha) {
			var canvas = this.doc.createElement('canvas'),
				ctx = canvas.getContext('2d'),
				len = w * h;
			canvas.width = w;
			canvas.height = h;
			ctx.drawImage(img, 0, 0);
			
			var imgData = ctx.getImageData(0, 0, w, h),
				pxIdx = 0;
			for (var i = 0; i < len; i++) {
				var a = obj.alphaData[i];
				if(a != undefined) imgData.data[pxIdx + 3] = a;
				pxIdx += 4;
			}
			
			ctx.putImageData(imgData, 0, 0);
			obj.hasAlpha = true;
			
			var uri = canvas.toDataURL();//,
				//timeout = CCIN('@mozilla.org/timer;1', 'nsITimer');
			//timeout.initWithCallback({ notify:function(timer) { img.param.value.data = atob(uri.split(',')[1]); } }, 10, Ci.nsITimer.TYPE_ONE_SHOT);
			
			img.param.value.data = atob(uri.split(',')[1]);
			img.src = uri;
		}
	},
	
	getValue: function(param) {
		var name = this.getParamName(param);
		
		if(param.value.hasOwnProperty('type') && param.value.type == 'Image') {
			var obj = param.value, 
				colorData = obj.colorData,
				width = obj.width, 
				height = obj.height, 
				uri = null;
				
			if(colorData) {
				var colorTableSize = obj.colorTableSize || 0,
					withAlpha = obj.withAlpha,
					bpp = (withAlpha || (obj.format == 5) ? 4 : 3),
					cmIdx = colorTableSize * bpp,
					pxIdx = 0,
					canvas = this.doc.createElement("canvas"),
					ctx = canvas.getContext("2d"),
					imgData = ctx.createImageData(width, height),
					pad = colorTableSize ? ((width + 3) & ~3) - width : 0;
					
				canvas.width = width;
				canvas.height = height;
				
				// If colorTableSize, then image is Colormapped
				// If no colorTableSize, then image is Direct
				//ctx.mozImageSmoothingEnabled = false;   True by default
				
				// Without Alpha
				// (BitmapFormat 3) Colormapped Images are stored RGB, canvas uses RGBA
				// (BitmapFormat 4) Direct Images 15bit are UB[1] res, UB[5] red, UB[5] green, UB[5] blue (Big Endian?)
				// (BitmapFormat 5) Direct Images 24bit are UI8 res, UI8 red, UI8 green, UI8 blue
				
				// With Alpha
				// (BitmapFormat 3) Colormapped Images are stored RGBA, canvas uses RGBA
				// (BitmapFormat 5) Direct Images 32bit are stored ARGB, canvas uses RGBA
				if(obj.format == 4) colorData = new Flashbug.BytearrayString(colorData.join(''));
				
				for (var y = 0; y < height; y++) {
					for (var x = 0; x < width; x++) {
						var idx = (colorTableSize ? colorData[cmIdx++] : cmIdx++) * bpp, r, g, b, a;
						if(withAlpha) {
							r = colorTableSize ? colorData[idx] : colorData[idx + 1];
							g = colorTableSize ? colorData[idx + 1] : colorData[idx + 2];
							b = colorTableSize ? colorData[idx + 2] : colorData[idx + 3];
							a = colorTableSize ? colorData[idx + 3] : colorData[idx];
						} else {
							if(obj.format == 3) {
								r = colorData[idx];
								g = colorData[idx + 1];
								b = colorData[idx + 2];
							} else if(obj.format == 4) {
								// PIX15
								colorData.readUB(1); // Reserved
								r = colorData.readUB(5);
								g = colorData.readUB(5);
								b = colorData.readUB(5);
							} else if(obj.format == 5) {
								// PIX24
								//colorData[idx]; // Reserved
								r = colorData[idx + 1];
								g = colorData[idx + 2];
								b = colorData[idx + 3];
							}
							a = 255;
						}
						
						if(a) {
							imgData.data[pxIdx] = r || 0; //R
							imgData.data[pxIdx + 1] = g || 0; //G
							imgData.data[pxIdx + 2] = b || 0; //B
							imgData.data[pxIdx + 3] = a; //A
						}
						pxIdx += 4;
					}
					cmIdx += pad;
				}
				
				ctx.putImageData(imgData, 0, 0);
				uri = canvas.toDataURL();
			} else {
				uri = "data:image/jpeg;base64," + btoa(obj.data);
				// img.src doesn't update fast enough to grab color data
				/*if (obj.alphaData) {
					var img = new Image(),
						canvas = this.doc.createElement("canvas"),
						ctx = canvas.getContext("2d"),
						len = width * height,
						data = obj.alphaData;
					img.src = uri;
					canvas.width = width;
					canvas.height = height;
					ctx.drawImage(img, 0, 0);
					var imgData = ctx.getImageData(0, 0, width, height),
						pxIdx = 0;
					for (var i = 0; i < len; i++) {
						imgData.data[pxIdx + 3] = data[i];
						pxIdx += 4;
					}
					ctx.putImageData(imgData, 0, 0);
					uri = canvas.toDataURL();
				}*/
			}
			
			obj.uri = uri;
			obj.data = atob(uri.split(',')[1]);
			
			return uri;
		}
		
        return param;
	},
});

Flashbug.DecompileModule.Video = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name'),
				TAG('$param|getUnsupportedTag', {param: '$param'})
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Codec')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getVideoCodec')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Deblocking')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getVideoDeblocking')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Smoothing')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.smoothing|capitalize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Frames')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.numFrames')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN($FL_STR('flashbug.netInfoSWF.dimensions'))),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getVideoSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		),
		
	videoCompression : [
		'',
		'JPEG',
		'Sorenson Spark (H.263)',
		'Screen Video',
		'On2 Truemotion VP6',
		'On2 Truemotion VP6 with Alpha',
		'Screen Video v2',
		'AVC (H.264)'
	],
	
	videoDeblocking : [
		' using video packet value',
		'ing Off',
		'ing Level 1 (Fast deblocking filter)',
		'ing Level 2 (VP6 only, better deblocking filter)',
		'ing Level 3 (VP6 only, better deblocking plus fast deringing filter)',
		'ing Level 4 (VP6 only, better deblocking plus better deringing filter)'
	],
	
	getVideoSize: function(objVideo) {
		return objVideo.value.width + ' x ' + objVideo.value.height;
	},
		
	getVideoCodec: function(objVideo) {
		return this.videoCompression[objVideo.value.codecID];
	},
	
	getVideoSmoothing: function(objVideo) {
		return (objVideo.value.smoothing ? 'Smoothing On (Higher Quality)' : 'Smoothing Off (Faster)');
	},
	
	getVideoDeblocking: function(objVideo) {
		return 'Deblock' + this.videoDeblocking[objVideo.value.deblocking];
	}
});
 
Flashbug.DecompileModule.Font = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name')
			),
			TAG('$param|getFontTag', {param:'$param'}),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		),
		
	getFontTag: function(param) {
		if (param.value.tag == 'defineFont4') return this.defineFont4;
		return this.defineFont1_3;
	},
		
		getFontCopyright: function(obj) {
				if (obj.hasOwnProperty('fontName')) return obj.fontName.copyright;
				return '-'; 
			},
	defineFont4:
		TABLE({cellpadding: 0, cellspacing: 0},
			TBODY({"class": "netInfoResponseHeadersBody"},
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Style')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getStyle')
					)
				),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Glyph Count')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.numGlyphs')
						)
					),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Copyright')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.info.copyright')
					)
				),
				TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					
					TR({},
					TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
					)
				)
			)
		),
		
	defineFont1_3:
		TABLE({cellpadding: 0, cellspacing: 0},
			TBODY({"class": "netInfoResponseHeadersBody"},
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Glyphs')),
					TD({'class': 'netInfoParamValue'},
							SPAN({'class': 'flb-dec-image-box'}, 
								FOR("glyph", "$param.value.glyphShapeTable",
									SPAN({_innerHTML: '$glyph.svg'})
								)
							)
						)
				),
				
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Style')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getStyle')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Shift-JIS')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.info.isShiftJIS|capitalize')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Small Text')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.info.isSmallText|capitalize')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Encoding')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getANSI')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Glyph Count')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.numGlyphs')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Copyright')),
					TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value|getFontCopyright')
						)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Language')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getLanguage')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Size')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
					)
				)
			)
		),
		
	languageCode: [
			'None',
			'Latin',
			'Japanese',
			'Korean',
			'Simplified Chinese',
			'Traditional Chinese'
		],
		
	getANSI: function(obj) {
		// If swf version is later than 6, ANSI is UTF-8
		if (obj.value.info.isANSI) return 'ANSI';
		return 'UTF-8';
	},
		
	getStyle: function(obj) {
		var caption = [];
		if (obj.value.info.isItalics) caption.push('Italic');
		if (obj.value.info.isBold) caption.push('Bold');
		if (caption.length == 0) caption.push('Regular');
		return caption.join(', ');
	},
	
	getLanguage: function(obj) {
		return obj.value.info.languageCode ? this.languageCode[obj.value.info.languageCode] : '-';
	}
});

Flashbug.DecompileModule.Shape = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name'),
				TAG('$param|getUnsupportedTag', {param: '$param'})
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					TR({},
						TD({'class': 'netInfoParamValue', colSpan:2},
							FOR('image', '$param|getImages', 
								IMG({src: '$image|getBMPDataURI', _param:'$image', style:'display:none;', onload: '$onLoadImage'})
							),
							SPAN({'class': 'flb-dec-image-box', _param:'$param', _innerHTML: '$param|getSVGTag'})
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Dimensions')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		),
	
	getImages: function(obj) {
		var images = [];
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		if (value.fill && value.fill.image) images.push(value.fill.image);
		if (value.segments && value.segments.length > 0) {
			for (var i = 0; i < value.segments.length; i++) {
				if (value.segments[i].fill && value.segments[i].fill.image) {
					images.push(value.segments[i].fill.image);
				}
			}
		}
		return images;
	},
	
	getSVGTag: function(obj) { 
		var value = obj.hasOwnProperty('value') ? obj.value : obj;
		return value.svgHeaderThumb + value.data;
	},
	
	getBMPDataURI: function(image) {
		if(image.hasOwnProperty('type') && image.type == 'Image') {
			var obj = image, 
				colorData = obj.colorData,
				width = obj.width, 
				height = obj.height, 
				uri = null;
			if(colorData) {
				var colorTableSize = obj.colorTableSize || 0,
					withAlpha = obj.withAlpha,
					bpp = (withAlpha || (obj.format == 5) ? 4 : 3),
					cmIdx = colorTableSize * bpp,
					pxIdx = 0,
					canvas = this.doc.createElement("canvas"),
					ctx = canvas.getContext("2d"),
					imgData = ctx.createImageData(width, height),
					pad = colorTableSize ? ((width + 3) & ~3) - width : 0;
					
				canvas.width = width;
				canvas.height = height;
				
				// If colorTableSize, then image is Colormapped
				// If no colorTableSize, then image is Direct
				//ctx.mozImageSmoothingEnabled = false;   True by default
				
				// Without Alpha
				// (BitmapFormat 3) Colormapped Images are stored RGB, canvas uses RGBA
				// (BitmapFormat 4) Direct Images 15bit are UB[1] res, UB[5] red, UB[5] green, UB[5] blue (Big Endian?)
				// (BitmapFormat 5) Direct Images 24bit are UI8 res, UI8 red, UI8 green, UI8 blue
				
				// With Alpha
				// (BitmapFormat 3) Colormapped Images are stored RGBA, canvas uses RGBA
				// (BitmapFormat 5) Direct Images 32bit are stored ARGB, canvas uses RGBA
				if(obj.format == 4) colorData = new Flashbug.BytearrayString(colorData.join(''));
				
				for (var y = 0; y < height; y++) {
					for (var x = 0; x < width; x++) {
						var idx = (colorTableSize ? colorData[cmIdx++] : cmIdx++) * bpp, r, g, b, a;
						if(withAlpha) {
							r = colorTableSize ? colorData[idx] : colorData[idx + 1];
							g = colorTableSize ? colorData[idx + 1] : colorData[idx + 2];
							b = colorTableSize ? colorData[idx + 2] : colorData[idx + 3];
							a = colorTableSize ? colorData[idx + 3] : colorData[idx];
						} else {
							if(obj.format == 3) {
								r = colorData[idx];
								g = colorData[idx + 1];
								b = colorData[idx + 2];
							} else if(obj.format == 4) {
								// PIX15
								colorData.readUB(1); // Reserved
								r = colorData.readUB(5);
								g = colorData.readUB(5);
								b = colorData.readUB(5);
							} else if(obj.format == 5) {
								// PIX24
								//colorData[idx]; // Reserved
								r = colorData[idx + 1];
								g = colorData[idx + 2];
								b = colorData[idx + 3];
							}
							a = 255;
						}
						
						if(a) {
							imgData.data[pxIdx] = r || 0; //R
							imgData.data[pxIdx + 1] = g || 0; //G
							imgData.data[pxIdx + 2] = b || 0; //B
							imgData.data[pxIdx + 3] = a; //A
						}
						pxIdx += 4;
					}
					cmIdx += pad;
				}
				
				ctx.putImageData(imgData, 0, 0);
				uri = canvas.toDataURL();
			} else {
				uri = "data:image/jpeg;base64," + btoa(obj.data);
				/*if (obj.alphaData) {
					var img = new Image(),
						canvas = this.doc.createElement("canvas"),
						ctx = canvas.getContext("2d"),
						len = width * height,
						data = obj.alphaData;
					img.src = uri;
					canvas.width = width;
					canvas.height = height;
					ctx.drawImage(img, 0, 0);
					var imgData = ctx.getImageData(0, 0, width, height),
						pxData = imgData.data,
						pxIdx = 0;
					for(var i = 0; i < len; i++){
						pxData[pxIdx + 3] = data[i];
						pxIdx += 4;
					}
					ctx.putImageData(imgData, 0, 0);
					uri = canvas.toDataURL();
				}*/
			}
			
			obj.uri = uri;
			obj.data = atob(uri.split(',')[1]);
			return uri;
		}
		
        return image;
	},
	
	onLoadImage: function(event) {
		var img = event.target,
			w = img.naturalWidth, 
			h = img.naturalHeight,
			obj = img.param;
		
		// Mix-in alpha data
		if (obj.alphaData && !obj.hasAlpha) {
			var canvas = img.ownerDocument.createElement('canvas'),
				ctx = canvas.getContext('2d'),
				len = w * h;
			canvas.width = w;
			canvas.height = h;
			ctx.drawImage(img, 0, 0);
			
			var imgData = ctx.getImageData(0, 0, w, h),
				pxIdx = 0;
			for (var i = 0; i < len; i++) {
				var a = obj.alphaData[i];
				if(a != undefined) imgData.data[pxIdx + 3] = a;
				pxIdx += 4;
			}
			
			ctx.putImageData(imgData, 0, 0);
			obj.hasAlpha = true;
			
			var uri = canvas.toDataURL();
			img.param.data = atob(uri.split(',')[1]);
		} else {
			var uri = obj.uri;
		}
		
		// Update SVG
		var span = img.parentNode.lastChild;
		span.param.value.data = span.param.value.data.replace('$$$_' + img.param.id + '_URI$$$', uri);
		span.innerHTML = span.param.value.svgHeaderThumb + span.param.value.data;
		
		// Update file size
		var codeFileSize = img.parentNode.parentNode.parentNode.children[img.parentNode.parentNode.parentNode.children.length - 2].lastChild.lastChild;
		codeFileSize.innerHTML = this.getFileSize(span.param);
		
		// Remove image
		img.parentNode.removeChild(img);
	}
});

Flashbug.DecompileModule.MorphShape = domplate(Flashbug.DecompileModule.Shape);

Flashbug.DecompileModule.Sound = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name'),
				TAG('$param|getUnsupportedTag', {param: '$param'})
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					TR({},
						TD({'class': 'netInfoParamValue', colSpan:2},
							TAG('$param|getAudioTag', {param: '$param'})
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Compression Format')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundCompression')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Sample Rate')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundRate')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Sample Type')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundType')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Sample Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Sample Count')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundSampleCount')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		),
		
	soundCompression : [
		'Raw, native-endian', /* SWF 1 */
		'ADPCM', /* SWF 1 */
		'MP3', /* SWF 4 */
		'Raw, little-endian', /* SWF 4 */
		'Nellymoser 16 kHz', /* SWF 10 */
		'Nellymoser 8 kHz', /* SWF 10 */
		'Nellymoser', /* SWF 6 */
		'',
		'',
		'',
		'',
		'Speex' /* SWF 10 */
	],
	
	soundRate : [
		'5.5 kHz',
		'11 kHz',
		'22 kHz',
		'44 kHz'
	],
	
	soundSize : [
		'8 Bit',
		'16 Bit'
	],
	
	soundType : [
		'Mono',
		'Stereo'
	],
	
	getAudio: function(obj) {
		return 'data:audio/wave;base64,' + btoa(obj.value.data);
	},
			
	getAudioTag: function(obj) {
		var ext = this.getFileExt(obj);
		if(ext == 'wav' && (obj.value.soundFormat == 0 || obj.value.soundFormat == 3)) return this.audioTag;
		return this.emptyTag;
	},
	
	getSoundCompression: function(objSound) {
		if(objSound.value.hasOwnProperty('streamSoundCompression')) return this.soundCompression[objSound.value.streamSoundCompression];
		return this.soundCompression[objSound.value.soundFormat];
	},
	
	getSoundRate: function(objSound) {
		if(objSound.value.hasOwnProperty('streamSoundRate')) return this.soundRate[objSound.value.streamSoundRate];
		return this.soundRate[objSound.value.soundRate];
	},
	
	getSoundSize: function(objSound) {
		if(objSound.value.hasOwnProperty('streamSoundSize')) return this.soundSize[objSound.value.streamSoundSize];
		return this.soundSize[objSound.value.soundSize];
	},
	
	getSoundType: function(objSound) {
		if(objSound.value.hasOwnProperty('streamSoundType')) return this.soundType[objSound.value.streamSoundType];
		return this.soundType[objSound.value.soundType];
	},
	
	getSoundSampleCount: function(objSound) {
		if(objSound.value.hasOwnProperty('streamSoundSampleCount')) return objSound.value.streamSoundSampleCount;
		return objSound.value.soundSampleCount;
	},
	
	audioTag:
		DIV({'class': 'flb-dec-sound-control'}, 
			TAG('$param|safeGetAudioTag', { })
		),
		
	// When used with Firebug 1.5 and Firefox 3.6, it was killing Firebug
	safeGetAudioTag: function(obj) {
		try {
			return AUDIO({ _src:this.getAudio(obj), _controls:' ' });
		} catch(e) {
			return this.emptyTag;
		}
	},
});

Flashbug.DecompileModule.StreamSound = domplate(Flashbug.DecompileModule.Sound, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name'),
				TAG('$param|getUnsupportedTag', {param: '$param'})
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					TR({},
						TD({'class': 'netInfoParamValue', colSpan:2},
							TAG('$param|getAudioTag', {param: '$param'})
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Compression Format')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundCompression')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Sample Rate')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundRate')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Sample Type')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundType')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Sample Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundSize')
						)
					),
					
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Average Sample Count')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.streamSoundSampleCount')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('MP3 Latency Seek')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param.value.latencySeek')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Playback Rate')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundPlaybackRate')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Playback Type')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundPlaybackType')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Playback Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getSoundPlaybackSize')
						)
					),
					
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		),
		
		getSoundPlaybackRate: function(objSound) {
			return this.soundRate[objSound.value.playbackSoundRate];
		},
		
		getSoundPlaybackSize: function(objSound) {
			return this.soundSize[objSound.value.playbackSoundSize];
		},
		
		getSoundPlaybackType: function(objSound) {
			return this.soundType[objSound.value.playbackSoundType];
		},
	
});

Flashbug.DecompileModule.ActionScript = domplate(Flashbug.DecompileModule.SWF, {
	
	tag:
		DIV(
            FOR("line", "$param.actionscript|lineIterator",
                DIV({"class": "sourceRow"},
                    SPAN({"class": "sourceLine"}, "$line.lineNo"),
                    SPAN({"class": "sourceRowText"}, "$line.text")
                )
            )
        ),
		
	lineIterator: function(lines) {
        var maxLineNoChars = (lines.length + "").length;
        var list = [];

        for (var i = 0; i < lines.length; ++i) {
            // Make sure all line numbers are the same width (with a fixed-width font)
            var lineNo = (i+1) + "";
            while (lineNo.length < maxLineNoChars) {
                lineNo = " " + lineNo;
			}

            list.push({lineNo: lineNo, text: lines[i]});
        }

        return list;
    }
});

Flashbug.DecompileModule.TextField = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name')
			),
			TAG('$param|getTextTag', {param: '$param'})
		),
		
	getTextTag: function(obj) {
			if (obj.value.tag == 'defineEditText') return this.dynamicTextTag;
			return this.staticTextTag;
		},
		
	staticTextTag:
		TABLE({cellpadding: 0, cellspacing: 0},
			TBODY({"class": "netInfoResponseHeadersBody"},
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Text')),
					TD({'class': 'netInfoParamValue'},
						FOR('string', '$param.value.strings',
							TABLE({cellpadding: 0, cellspacing: 0, 'class':'flb-dec-textGroup'},
								TBODY({},
									TR({},
										TD({'class': 'netInfoParamValue', colSpan:2},
											P({'class': 'flb-dec-text'}, '$string.text')
										)
									),
									TR({},
										TD({'class': 'netInfoParamName'}, SPAN('Font')),
										TD({'class': 'netInfoParamValue'},
											CODE({'class': 'focusRow subFocusRow'}, '$string.font')
										)
									),
									TR({},
										TD({'class': 'netInfoParamName'}, SPAN('Font Size')),
										TD({'class': 'netInfoParamValue'},
											CODE({'class': 'focusRow subFocusRow'}, '$string.textHeight')
										)
									),
									TR({},
										TD({'class': 'netInfoParamName'}, SPAN('Color')),
										TD({'class': 'netInfoParamValue'}, 
											CODE({'class': 'focusRow subFocusRow flb-dec-swatchTitle'}, '$string.textColor|getHex'),
											DIV({'class': 'flb-dec-swatch', 'style': 'background-color: $string.textColor|getColor'})
										)
									)
								)
							)
						)
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Color')),
					TD({'class': 'netInfoParamValue'},
						FOR('color', '$param.value.colors',
							DIV({},
								CODE({'class': 'focusRow subFocusRow flb-dec-swatchTitle'}, '$color|getHex'),
								DIV({'class': 'flb-dec-swatch', 'style': 'background-color: $color|getColor'})
							)
						)
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Dimensions')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getSize')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
					)
				)
			)
		),
		
	dynamicTextTag:
		TABLE({cellpadding: 0, cellspacing: 0},
			TBODY({"class": "netInfoResponseHeadersBody"},
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Text')),
					TD({'class': 'netInfoParamValue'},
						FOR('string', '$param.value.strings',
							TABLE({cellpadding: 0, cellspacing: 0, 'class':'flb-dec-textGroup'},
								TBODY({"class": "netInfoResponseHeadersBody"},
									TR({},
										TD({'class': 'netInfoParamValue', colSpan:2},
											P({'class': 'flb-dec-text'}, '$string')
										)
									)
								)
							)
						)
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Leading')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.leading')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('WordWrap')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.isWordWrap|capitalize')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Multiline')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.isMultiline|capitalize')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Password')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.isPassword|capitalize')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Read Only')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.isReadOnly|capitalize')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('AutoSize')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.isAutoSize|capitalize')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('No Select')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.isNoSelect|capitalize')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('HTMLText')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.isHTML|capitalize')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Align')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.align')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Left Margin')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.leftMargin')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Right Margin')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.rightMargin')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Indent')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.indent')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Variable Name')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.variableName')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Font')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param.value.font.info.name')
					)
				),
				TR({}, 
					TD({'class': 'netInfoParamName'}, SPAN('Color')),
					TD({'class': 'netInfoParamValue'},
						FOR('color', '$param.value.colors',
							DIV({},
								CODE({'class': 'focusRow subFocusRow flb-dec-swatchTitle'}, '$color|getHex'),
								DIV({'class': 'flb-dec-swatch', 'style': 'background-color: $color|getColor'})
							)
						)
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('Dimensions')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getSize')
					)
				),
				TR({},
					TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
					TD({'class': 'netInfoParamValue'},
						CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
					)
				)
			)
		)
});

Flashbug.DecompileModule.Header = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name')
			),
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					FOR('item', '$param.value',
						TR({},
							TD({'class': 'netInfoParamName'},
								SPAN('$item|getParamName')
							),
							TD({'class': 'netInfoParamValue'},
								TAG('$item|getValueTag', {object: '$item|getValue'})
							)
						)
					)
				)
			)
		),
	
	swatchTag:
		DIV({}, 
			CODE({'class': 'focusRow subFocusRow flb-dec-swatchTitle'}, '$object|getHex'),
			DIV({'class': 'flb-dec-swatch', 'style': 'background-color:$object|getColor'})
		),
		
	codeTag:
		FOR('line', '$object|getParamValueIterator',
			CODE({'class': 'focusRow subFocusRow', 'role': 'listitem'}, '$line')
		),
		
	getValue: function(param) {
		if (param.name == 'XMP') {
			var parser = CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
			var doc = parser.parseFromString(param.value, 'text/xml');
			var root = doc.documentElement;
			
			// Error handling
			var nsURI = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
			if (root.namespaceURI == nsURI && root.nodeName == 'parsererror') {
				/*Flashbug.ConsoleModule.XMLError.tag.replace({error: {
				message: root.firstChild.nodeValue + " [" + text + "]",
				source: root.lastChild.textContent
				}}, node);*/
				// Not sure how to handle this if there is invalid XML, although this should be super rare
				return param;
			}
			
			return root;
		}
		
		if (param.value.toString() == 'true' || param.value.toString() == 'false') param.value = this.capitalize(param.value);
		
		return param.value;
	},
		
	getValueTag: function(param) {
		if(param.name == 'Background Color') return this.swatchTag;
		if(param.name == 'XMP') return Firebug.HTMLPanel.CompleteElement.tag; // HTMLHtmlElement CompleteElement SoloElement Element
		return this.codeTag;
	}
});

Flashbug.DecompileModule.XML = domplate(Flashbug.DecompileModule.SWF, {
	tag:
		DIV({"class": "flb-dec-InfoBody"},
			DIV({"class": "netInfoHeadersGroup"},
				SPAN('$param.name')
			),
			
			TABLE({cellpadding: 0, cellspacing: 0},
				TBODY({"class": "netInfoResponseHeadersBody"},
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('XML')),
						TD({'class': 'netInfoParamValue'},
							TAG(Firebug.HTMLPanel.CompleteElement.tag, {object: '$param.value.data|getXML'})
						)
					),
					
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('Size')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getFileSize')
						)
					),
					TR({},
						TD({'class': 'netInfoParamName'}, SPAN('SWF Tag')),
						TD({'class': 'netInfoParamValue'},
							CODE({'class': 'focusRow subFocusRow'}, '$param|getTag')
						)
					)
				)
			),
			DIV({'class': 'flb-dec-thumb-caption flb-dec-thumb-export $param|hasData', onclick: '$onSave', _repObject:'$param.value'}, 
				$FL_STR('flashbug.netInfoAMF.save')
			)
		),
		
	getXML: function(xml) {
		var parser = CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
		var doc = parser.parseFromString(xml, 'text/xml');
		var root = doc.documentElement;
		
		// Error handling
		var nsURI = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
		if (root.namespaceURI == nsURI && root.nodeName == 'parsererror') {
			/*Flashbug.ConsoleModule.XMLError.tag.replace({error: {
			message: root.firstChild.nodeValue + " [" + text + "]",
			source: root.lastChild.textContent
			}}, node);*/
			// Not sure how to handle this if there is invalid XML, although this should be super rare
			return param;
		}
		
		return root;
	}
});

// Panel Implementation
//-----------------------------------------------------------------------------
function DecompilePanel() { }
DecompilePanel.prototype = extend(Firebug.ActivablePanel, {
	
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Inspector Panel																		  //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	////////////////////////////
	// Firebug Panel Override //
	////////////////////////////
	
	initialize: function(context, doc) {
		this.panelSplitter = $("fbPanelSplitter");
		this.sidePanelDeck = $("fbSidePanelDeck");
		
		Firebug.ActivablePanel.initialize.apply(this, arguments);
	},
	
	// Called at the end of module.initialize; addEventListener-s here
	initializeNode: function(panelNode) {
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
			//Flashbug.FlashModule.addObserver(this);
		} else {
			//Flashbug.FlashModule.removeObserver(this);
		}
	},
	
	////////////////////////
	// Inspector Specific //
	////////////////////////
	
	name: panelName,
	title: $FL_STR('flashbug.decPanel.title'),
	searchable: true,
	//inspectable: true,
   // breakable: false,
   // inspectorHistory: new Array(5),
	order: 90,
	
	refresh: function() {
		var tabId = Firebug.getTabIdForWindow(this.context.window);
		var context = contexts[tabId];
        context = context ? context : Firebug.TabWatcher.getContextByWindow(this.context.window);
		
		// Do we have access to the context, if so, parse
		if(context && context.hasOwnProperty('swfs')) {
			//
		} else {
			return;
		}
		
		Flashbug.getContext().getPanel(treePanel).refresh(context.swfs);
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
		var version = Flashbug.playerVersion;
		
		// If we know for sure they have the debugger, hide link
		if(version.indexOf("Debug") != -1) Firebug.chrome.$("fbFlashbugDownload").style.display = 'none';
		
		Firebug.chrome.$("flbVersion").value = version;
	}
});

function TempContext(tabId) {
    this.tabId = tabId;
	this.swfs = {};
	this.length = 0;
}

//////////////////////////
// Firebug Registration //
//////////////////////////

Firebug.registerActivableModule(Flashbug.DecompileModule);
Firebug.registerPanel(DecompilePanel);

/////////////////////////////
// Firebug Trace Constants //
/////////////////////////////

FBTrace.DBG_FLASH_DECOMPILER = 	Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_DECOMPILER");

}});