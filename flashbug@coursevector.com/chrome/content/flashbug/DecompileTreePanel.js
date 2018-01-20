FBL.ns(function() { with (FBL) {
	
// Constants
const panelName = "flbDecompilerTree";
const panelTitle = "SWFs";
const parentPanelName = "flbDecompiler";

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;

var trace = function(msg, obj) {
	msg = "Flashbug - Flash::" + msg;
	if (FBTrace.DBG_FLASH_DECOMPILER) {
		if (typeof FBTrace.sysout == "undefined") {
			Flashbug.alert(msg + " | " + obj);
		} else {
			FBTrace.sysout(msg, obj);
		}
	}
}
	
Flashbug.DecompileTreeModule = extend(Firebug.Module, {
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends Module
	
	dispatchName: panelName,
	
	showPanel: function(browser, panel) {
		var isPanel = panel && panel.name == panelName;
		if (isPanel) {
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
});

Flashbug.DecompileModule.Tree = domplate(Firebug.Rep, {
    tag:
        UL({'class':'flash-dec-tree'},
			FOR("file", "$swfs",
				LI({'class':'isSWF hasChildren', _file:'$file'},
					IMG({"class": "flash-dec-twisty"}),
					A({href:'#', title:'$file|getURI', 'class':'swf'}, '$file|getName'),
					UL({'class':'tree'})
				)
			)
		),
		
	leafTag:
		LI({'class':'isSWF hasChildren', _file:'$file'},
			IMG({"class": "flash-dec-twisty"}),
			A({href:'#', title:'$file|getURI', 'class':'swf'}, '$file|getName'),
			UL({'class':'tree'})
		),
		
	getURI: function(file) {
		if (file.URI) return file.URI.asciiSpec;
		return file.href;
	},
	
	getName: function(file) {
		return this.getURI(file).split('/').pop();
	}
});

Flashbug.DecompileModule.Loading = domplate(Firebug.Rep, {
	tag:
		DIV({"class": "flb-dec-loading"})
});

Flashbug.DecompileModule.Error = domplate(Firebug.Rep, {
	tag:
		LI({'class':'Error'},
			IMG({"class": "twisty2"}),
			A({href:'#', title:'$message', 'class':'Error'}, '$message'),
			UL({'class':'tree'})
		)
});

Flashbug.DecompileModule.SubTree = domplate(Firebug.Rep, {
	tag:
		LI({'class':'$title.type hasChildren'},
			IMG({"class": "flash-dec-twisty"}),
			A({href:'#', title:'$title.name', 'class':'$title.type'}, '$title.name'),
			UL({'class':'flash-dec-tree'},
				FOR("item", "$array",
					TAG('$item|getLeafTag', {item: '$item'})
				)
			)
		),
		
	frameTag:
		LI({'class':'MovieClip hasChildren'},
			IMG({"class": "flash-dec-twisty"}),
			A({href:'#', title:'$title.name', 'class':'$title.type'}, '$title.name'),
			UL({'class':'flash-dec-tree'},
				FOR("item", "$array",
					LI({'class':'MovieClip hasChildren'},
						IMG({"class": "twisty2"}),
						A({href:'#', title:'$item.name', 'class':'MovieClip action', _repObject:'$item.data'}, '$item.name'),
						UL({'class':'tree'},
							FOR("frame", "$item.data.value",
								LI({'class':'Action hasChildren'},
									A({href:'#', title:'$frame|getFrameLabel', 'class':'Frame', _repObject:'$frame'}, '$frame|getFrameLabel')
								)
							)
						)
					)
				)
			)
		),
		
	leafTag:
		LI({'class':'isSWF MovieClip hasChildren', _file:'$item.data.value.data'},
			IMG({"class": "twisty2"}),
			A({href:'#', title:'$item.name', 'class':'$item.type swf'}, '$item.name'),
			UL({'class':'tree'})
		),
		
	nodeTag:
		LI({},
			IMG({"class": "twisty2"}),
			A({href:'#', title:'$item.name', 'class':'$item.type', $isSpecial:'$item|isSpecial', _repObject:'$item.data'}, '$item.name')
		),
		
	isSpecial: function(item) {
		// defineBitsJPEG4
		if (item.data.value.tag == 'defineBitsJPEG4') return true;
		// defineBitsLossless 15-bit RGB image
		if (item.data.value.tag == 'defineBitsLossless' && item.data.value.format == 4) return true;
		// soundStreamHead2 Uncompressed, native-endian
		if (item.data.value.tag == 'soundStreamHead2' && item.data.value.streamSoundCompression == 0) return true;
		// soundStreamHead2 Speex
		if (item.data.value.tag == 'soundStreamHead2' && item.data.value.streamSoundCompression == 11) return true;
		// defineVideoStream Screen Video V2
		if (item.data.value.tag == 'defineVideoStream' && item.data.value.codecID == 6) return true;
		// defineVideoStream H.264
		if (item.data.value.tag == 'defineVideoStream' && item.data.value.codecID == 7) return true;
		
		return false;
	},
		
	getLeafTag: function(item) {
		if (item.data.value.isSWF) return this.leafTag;
		return this.nodeTag;
	},
		
	getFrameLabel: function(frame) {
		var lbl = 'Frame ' + frame.frame;
		if (frame.hasOwnProperty('label')) lbl += ' (' + frame.label + ')';
		return lbl;
	}
});

function DecompileTreePanel() { }
DecompileTreePanel.prototype = extend(Firebug.Panel, {
    
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Shared Objects Panel                                                                     //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	////////////////////////////
	// Firebug Panel Override //
	////////////////////////////
	
	name: panelName,
	title: panelTitle,
    parentPanel:parentPanelName,
	order:20,
	
	initialize: function(context, doc) {
		this.onClick = bind(this.onClick, this);
        this.onMouseDown = bind(this.onMouseDown, this);
		
		Firebug.ActivablePanel.initialize.apply(this, arguments);
	},
	
	initializeNode: function(oldPanelNode) {
		this.panelNode.addEventListener("click", this.onClick, false);
        this.panelNode.addEventListener("mousedown", this.onMouseDown, false);
	},

	destroyNode: function() {
		this.panelNode.removeEventListener("click", this.onClick, false);
        this.panelNode.removeEventListener("mousedown", this.onMouseDown, false);
	},
	
	show: function(state) {
		if (this.context.loaded && !this.location) { // wait for loadedContext to restore the panel
			// Append CSS
			var doc = this.panelNode.ownerDocument;
			if ($("flashbugFlashStyles", doc)) {
				// Don't append the stylesheet twice. 
			} else {
				var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/inspector.css");
				styleSheet.setAttribute("id", "flashbugFlashStyles");
				addStyleSheet(doc, styleSheet);
			}
		}
	},
	
	getContextMenuItems: function(style, target, context) {
		var items = [];
		if(target.className == "swf ") {
			var url = target.title;
			items.push({label: $FL_STR("flashbug.contextMenu.copyLocation"), nol10n: true, command: bindFixed(copyToClipboard, FBL, url) });
			items.push({label: $FL_STR("flashbug.contextMenu.openTab"), nol10n: true, command: bindFixed(openNewTab, FBL, url) });
		} else {
			items.push({label: $FL_STR("flashbug.contextMenu.copy"), nol10n: true, command: bindFixed(copyToClipboard, FBL, target.textContent) });
		}

        return items;
    },
	
	////////////////////
	// Flash Specific //
	////////////////////
	
	refresh: function(swfs) {
		var arr = [];
		for (var url in swfs) {
			arr.push(swfs[url]);
		}
		
		Flashbug.DecompileModule.Tree.tag.replace({swfs:arr}, this.panelNode, Flashbug.DecompileModule.Tree);
	},
	
	append: function(swf) {
		if (this.panelNode.innerHTML == '') {
			Flashbug.DecompileModule.Tree.tag.replace({swfs:[swf]}, this.panelNode, Flashbug.DecompileModule.Tree);
		} else {
			Flashbug.DecompileModule.Tree.leafTag.append({file:swf}, this.panelNode.firstChild, Flashbug.DecompileModule.Tree);
		}
	},
	
	processData: function(obj) {
		var arr = [], arrHeader = [], arrMetadata = [];
		if (obj.error && obj.error == 'swf') {
			arrHeader.push({name:$FL_STR('flashbug.netInfoSWF.colError.title'), value:[$FL_STR('flashbug.netInfoSWF.error.SWF')]});
			arr.push({name:'Header', value:arrHeader});
			return arr;
		}
		
		arrHeader.push({name:'Compressed', value:obj.isCompressed});
		arrHeader.push({name:'SWF Version', value:obj.version});
		arrHeader.push({name:'File Size', value:obj.fileLength});
		if(obj.hasOwnProperty('fileLengthCompressed')) arrHeader.push({name:'File Size (Compressed)', value:obj.fileLengthCompressed});
		
		var f = obj.frameSize;
		arrHeader.push({name:'Frame Width', value:(f.right - f.left) / 20});
		arrHeader.push({name:'Frame Height', value:(f.bottom - f.top) / 20});
		arrHeader.push({name:'Frame Rate', value:obj.frameRate});
		arrHeader.push({name:'Frame Count', value:obj.frameCount});
		arr.push({name:'Header', value:arrHeader});
		
		if(obj.hasOwnProperty('useDirectBlit')) arrMetadata.push({name:'Use Direct Blit', value:obj.useDirectBlit});
		if(obj.hasOwnProperty('useGPU')) arrMetadata.push({name:'Use GPU', value:obj.useGPU});
		if(obj.hasOwnProperty('actionscript3')) arrMetadata.push({name:'AS3', value:obj.actionscript3});
		if(obj.hasOwnProperty('useNetwork')) arrMetadata.push({name:'Use Network', value:obj.useNetwork});
		
		if(obj.hasOwnProperty('backgroundColor')) {
			arrMetadata.push({name:'Background Color', value:obj.backgroundColor});
		} else {
			arrMetadata.push({name:'Background Color', value:{red:255, green:255, blue:255}});
		}
		
		if(obj.hasOwnProperty('isProtected')) {
			arrMetadata.push({name:'Protected', value:obj.password || 'true'});
		} else {
			arrMetadata.push({name:'Protected', value:'false'});
		}
		
		//if(obj.hasOwnProperty('jpegTables') && obj.jpegTables != '') arrMetadata.push({name:'JPEG Tables', value:obj.jpegTables});
		
		if(obj.hasOwnProperty('productInfo')) {
			arrMetadata.push({name:'Created With', value: 'Adobe Flex ' + obj.productInfo.sdk});
			if (obj.productInfo.hasOwnProperty('compileTimeStamp')) arrMetadata.push({name:'Compilation Date', value:obj.productInfo.compileTimeStamp});
		}
		
		if(obj.hasOwnProperty('metadata')) {
			var regex = /<xmp:creatortool>([^<]+)<\/xmp:creatortool>/i;
			var result = regex.exec(obj.metadata);
			
			var value = result ? result[1] : null;
			if (value) arrMetadata.push({name:'Created With', value:value});
			
			regex = /<xmp:modifydate>([^<]+)<\/xmp:modifydate>/i;
			result = regex.exec(obj.metadata);
			
			value = result ? result[1] : null;
			if (value) arrMetadata.push({name:'Compilation Date', value:new Date(value).toLocaleString()});
			
			arrMetadata.push({name:'XMP', value:obj.metadata});
		}
		arr.push({name:'Metadata', value:arrMetadata});
		
		if(obj.hasOwnProperty('fonts')) {
			var l = obj.fonts.length;
			var arrFonts = [];
			for(var i = 0; i < l; i++) {
				var font = obj.fonts[i];
				if (!font.info.copyright) font.info.copyright = '';
				if (font.info.hasOwnProperty('name')) {
					// Remove UTF-8 encoding error
					var lastChar = font.info.name.substring(font.info.name.length - 1);
					font.info.name = lastChar.charCodeAt(0) == 0 ? font.info.name.substring(0, font.info.name.length - 1) : font.info.name;
					
					arrFonts.push({name:font.info.name, type:'Font', value:font});
				}
			}
			
			if (arrFonts.length > 0) arr.push({name:'Fonts (' + arrFonts.length + ')', value:arrFonts});
		}
		
		function getSymbolName(obj, id, label) {
			var obj = obj.dictionary[id],
				exportName = obj ? obj.exportName : null;
			if (exportName) {
				exportName = exportName.substring(exportName.lastIndexOf('.') + 1);
				exportName = exportName.substring(exportName.lastIndexOf('_') + 1);
				return exportName;
			} else {
				return label + ' ' + id;
			}
		}
		
		if(obj.hasOwnProperty('binary')) {
			var l = obj.binary.length;
			var arrBin = [];
			for(var i = 0; i < l; i++) {
				var bin = obj.binary[i];
				bin.name = getSymbolName(obj, bin.id, 'Binary');
				if (bin.isPBJ) bin.name = bin.pbName;
				var type = 'Binary';
				if (bin.isPBJ) type = 'PixelBender';
				if (bin.isXML) type = 'XML';
				arrBin.push({name:bin.name, type:type, value:bin});
			}
			
			if (arrBin.length > 0) arr.push({name:'Binary (' + arrBin.length + ')', value:arrBin});
		}
		
		if(obj.hasOwnProperty('videos')) {
			var l = obj.videos.length;
			var arrVid = [];
			for(var i = 0; i < l; i++) {
				var vid = obj.videos[i];
				vid.name = getSymbolName(obj, vid.id, 'Video');
				
				// Could be a placed video object on stage that plays a loaded FLV, skip those
				if (vid.data.length > 0) arrVid.push({name:vid.name, type:'Video', value:vid});
			}
			
			if (arrVid.length > 0) arr.push({name:'Videos (' + arrVid.length + ')', value:arrVid});
		}
		
		if(obj.hasOwnProperty('shapes')) {
			var l = obj.shapes.length;
			var arrShapes = [];
			for(var i = 0; i < l; i++) {
				var shp = obj.shapes[i];
				shp.name = getSymbolName(obj, shp.id, 'Shape');
				arrShapes.push({name:shp.name, type:'Shape', value:shp});
			}
			
			if (arrShapes.length > 0) arr.push({name:'Shapes (' + arrShapes.length + ')', value:arrShapes});
		}
		
		if(obj.hasOwnProperty('morph_shapes')) {
			var l = obj.morph_shapes.length;
			var arrShapes = [];
			for(var i = 0; i < l; i++) {
				var shp = obj.morph_shapes[i];
				shp.name = getSymbolName(obj, shp.id, 'Morph Shape');
				shp.start.name = shp.name + ' Start';
				shp.end.name = shp.name + ' End';
				arrShapes.push({name:shp.name, type:'MorphShape', value:shp});
			}
			
			if (arrShapes.length > 0) arr.push({name:'Morph Shapes (' + arrShapes.length + ')', value:arrShapes});
		}
		
		if(obj.hasOwnProperty('images')) {
			var l = obj.images.length;
			var arrImgs = [];
			for(var i = 0; i < l; i++) {
				var img = obj.images[i];
				img.name = getSymbolName(obj, img.id, 'Image');
				arrImgs.push({name:img.name, type:'Bitmap', value:img});
			}
			
			if (arrImgs.length > 0) arr.push({name:'Images (' + arrImgs.length + ')', value:arrImgs});
		}
		
		if(obj.hasOwnProperty('sounds')) {
			var l = obj.sounds.length;
			var arrSnds = [];
			for(var i = 0; i < l; i++) {
				var snd = obj.sounds[i];
				
				if (snd.hasOwnProperty('streamID')) {
					if (snd.data.length > 0) arrSnds.push({name:'Sound Stream ' + snd.streamID, type:'StreamSound', value:snd});
				} else {
					snd.name = getSymbolName(obj, snd.id, 'Sound');
					// Buttons sometimes have unused sound streams
					if (snd.data.length > 0) arrSnds.push({name:snd.name, type:'Sound', value:snd});
				}
			}
			
			if (arrSnds.length > 0) arr.push({name:'Sounds (' + arrSnds.length + ')', value:arrSnds});
		}
		
		if(obj.hasOwnProperty('text')) {
			var l = obj.text.length;
			var arrTxt = [];
			for(var i = 0; i < l; i++) {
				var txt = obj.text[i];
				
				if (txt.fontID) txt.font = obj.dictionary[txt.fontID];
				if (!txt.strings) txt.strings = [];
				if (txt.initialText) txt.strings = [txt.initialText];
				if (!txt.colors) txt.colors = [];
				if (txt.textColor) txt.colors = [txt.textColor];
				if (txt.variableName) {
					txt.name = txt.variableName;
				} else {
					if (txt.initialText) {
						txt.name = 'Dynamic Text ' + txt.id;
					} else {
						txt.name = 'Text ' + txt.id;
					}
				}
				
				// Don't display empty strings
				//if (txt.strings.length > 0 && txt.strings[0].length > 0) 
				arrTxt.push({name:txt.name, type:'TextField', value:txt});
			}
			
			if (arrTxt.length > 0) arr.push({name:'Text (' + arrTxt.length + ')', value:arrTxt});
		}
		
		/*var arrActions = [];
		
		// Timeline
		if(obj.hasOwnProperty('frames')) {
			var arrFrames = [];
			for(var i = 0; i <= obj.frameCount; i++) {
				var frame = obj.frames[i];
				if (frame) {
					if (frame instanceof Array) {
						var as = [], actions = [];
						for (var i3 = 0; i3 < frame.length; i3++) {
							actions = actions.concat(frame[i3].actions);
							as.push('', '\\\\ Action segment ' + (i3 + 1));
							as = as.concat(frame[i3].actionscript);
						}
						var o = {type:'ActionScript', frame:frame[0].frame, actions:actions, actionscript:as};
						if (frame[0].label) o.label = label;
						arrFrames.push(o);
					} else {
						var as = [], actions = [];
						if (frame.actions) {
							actions = actions.concat(frame.actions);
							as.push('', '\\\\ Action Segment 1');
							as = as.concat(frame.actionscript);
						}
						
						var o = {type:'ActionScript', frame:frame.frame, actions:actions, actionscript:as};
						if (frame.label) o.label = frame.label;
						arrFrames.push(o);
					}
				}
			}
			
			if (arrFrames.length > 0) arrActions.push({name:'Main Timeline', type:'Actions', value:arrFrames});
		}
		
		// Exported Sprites
		if(obj.hasOwnProperty('dictionary')) {
			var l = obj.dictionary.length;
			for(var i = 0; i < l; i++) {
				var asset = obj.dictionary[i];
				if (asset && asset.type == 'Sprite' && asset.frameCount > 0) {
					var l2 = asset.frameCount;
					var arrFrames = [];
					for(var i2 = 0; i2 <= l2; i2++) {
						var frame = asset.frames[i2];
						if (frame) {
							if (frame instanceof Array) {
								var as = [], actions = [];
								for (var i3 = 0; i3 < frame.length; i3++) {
									if (i3 == 0 && asset.hasOwnProperty('initAction')) {
										actions = actions.concat(asset.initAction.actions);
										as.push('\\\\ Initial Action Segment ' + (i3 + 1));
										as = as.concat(asset.initAction.actionscript);
									}
									
									if (frame[i3].actions) {
										actions = actions.concat(frame[i3].actions);
										as.push('', '\\\\ Action Segment ' + (i3 + 1));
										as = as.concat(frame[i3].actionscript);
									}
								}
								var o = {type:'ActionScript', frame:frame[0].frame, actions:actions, actionscript:as};
								if (frame[0].label) o.label = frame[0].label;
								arrFrames.push(o);
							} else {
								var as = [], actions = [];
								if (i2 == 1 && asset.hasOwnProperty('initAction')) {
									actions = actions.concat(asset.initAction.actions);
									as.push('\\\\ Initial Action Segment 1');
									as = as.concat(asset.initAction.actionscript);
								}
								
								if (frame.actions) {
									actions = actions.concat(frame.actions);
									as.push('', '\\\\ Action Segment 1');
									as = as.concat(frame.actionscript);
								}
								
								var o = {type:'ActionScript', frame:frame.frame, actions:actions, actionscript:as};
								if (frame.label) o.label = frame.label;
								arrFrames.push(o);
							}
						}
					}
					
					if (arrFrames.length == 0 && asset.hasOwnProperty('initAction')) {
						var as = [], actions = [];
						actions = actions.concat(asset.initAction.actions);
						as.push('\\\\ Initial Action Segment 1');
						as = as.concat(asset.initAction.actionscript);
						
						var o = {type:'ActionScript', frame:1, actions:actions, actionscript:as};
						arrFrames.push(o);
					}
					
					if (arrFrames.length > 0) arrActions.push({name:'Sprite ' + asset.id + (asset.exportName ? ' (' + asset.exportName + ')' : ''), type:'Actions', value:arrFrames});
				}
			}
		}
		
		if (arrActions.length > 0) arr.push({name:'Actions (' + arrActions.length + ')', value:arrActions});*/
		
		return arr;
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
            if (!hasClass(target, "flash-dec-twisty") && target.localName == 'a') {
				 toggleClass(target.parentNode, 'opened');
			}
        }
    },

    onMouseDown: function(event) {
        if (!isLeftClick(event)) return;
		
		var target = event.target;
		if (hasClass(target.parentNode, 'isSWF')) {
			var loading = target.parentNode.querySelector("div.flb-dec-loading");
			if (target.parentNode.swf || loading) {
				// continue;
			} else {
				// decompile swf
				Flashbug.DecompileModule.Loading.tag.insertBefore({}, target.parentNode.lastChild, Flashbug.DecompileModule.Loading);
				
				var t = this;
				try {
					var worker = new Worker('chrome://flashbug/content/lib/SWFWorker.js');
					worker.onmessage = function(event) {
						if (event.data && event.data.type && event.data.type == 'debug') {
							if (event.data.data) {
								trace('Worker trace - ' + event.data.title, event.data.data);
							} else {
								var arr = event.data.message,
								title = arr.shift();
								trace('Worker trace - ' + title, arr);
							}
						} else {
							trace('Worker message data', event.data);
							target.parentNode.swf = t.processData(event.data);
							trace('Worker message', target.parentNode.swf);
							
							// Generate UI using Domplate template
							t.displayData(target);
						}
					};
					worker.onerror = function(error) {
						trace('Worker error', error);
						target.parentNode.swf = 'error';
						t.displayError(target, error);
					};
					
					// Returns raw bytes without UTF conversion done by Firebug
					if(target.parentNode.file && !(target.parentNode.file.URI || target.parentNode.file.href)) {
						// Embedded binary swf
						var responseText = target.parentNode.file;
					} else {
						// Actual page swf
						var responseText = getResource(Flashbug.DecompileModule.Tree.getURI(target.parentNode.file));
					}
					
					var config = {};
					config.headerOnly = Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFHeaderOnly');
					config.font = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFFont');
					config.binary = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFBinary');
					config.video = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFVideo');
					config.shape = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFShape');
					config.morph = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFMorph');
					config.image = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFImage');
					config.sound = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFSound');
					config.text = config.headerOnly ? false : Firebug.getPref(Firebug.prefDomain, 'flashbug.enableSWFText');
					
					worker.postMessage({text:responseText, config:config});
				} catch (e) {
					target.parentNode.swf = 'error';
					t.displayError(target, e);
				}
				return;
			}
		}
		
		this.clickHandler(target);
    },
	
	clickHandler:function(target) {
		
		if (target.localName == 'a' && !hasClass(target, 'action')) {
			var isSWFTitle = false;
			if (target.parentNode.getAttribute('rel')) isSWFTitle = true;
			Flashbug.FlashModule.setAClass(target, 'selected', isSWFTitle);
			// selectobject
			trace('Item Data', target.repObject);
			Flashbug.DecompileModule.showDetails(target.repObject);
		}
		
		if (hasClass(target, "flash-dec-twisty") || hasClass(target, "twisty2")) {
			// getleaftree
			toggleClass(target.parentNode, 'opened');
		}
	},
	
	displayError: function(target, error) {
		// Remove Loader
		var loader = target.parentNode.getElementsByTagName('div')[0];
		target.parentNode.removeChild(loader);
		
		var o = {message:'Error: ' + error.message + ' (' + error.filename + '@' + (error.lineno || error.lineNumber) + ')'};
		Flashbug.DecompileModule.Error.tag.append(o, target.parentNode.lastChild, Flashbug.DecompileModule.Error);
		
		this.clickHandler(target);
	},
	
	displayData: function(target) {
		var swf = target.parentNode.swf;
		
		// Remove Loader
		var loader = target.parentNode.getElementsByTagName('div')[0];
		target.parentNode.removeChild(loader);
		
		var aNode = target.parentNode.getElementsByTagName('a')[0],
			arr = [];
		aNode.repObject = arr;
		
		
		for(var key in swf) {
			var obj = swf[key],
				o = {title:{name:obj.name, type:'Folder'}, array:[]};
				
			if (obj.name == 'Header' || obj.name == 'Metadata') {
				arr.push(obj);
				continue;
			}
			
			for (var i = 0, l = obj.value.length; i < l; i++) {
				var data = obj.value[i];
				o.array.push({name:data.name, type:data.type, data:data});
			}
			if (l > 0) o.hasChildren = true;
			
			if (obj.name.indexOf('Actions') == 0) {
				Flashbug.DecompileModule.SubTree.frameTag.append(o, target.parentNode.lastChild, Flashbug.DecompileModule.SubTree);
			} else {
				Flashbug.DecompileModule.SubTree.tag.append(o, target.parentNode.lastChild, Flashbug.DecompileModule.SubTree);
			}
		}
		
		this.clickHandler(target);
	}
});

//////////////////////////
// Firebug Registration //
//////////////////////////
Firebug.registerModule(Flashbug.DecompileTreeModule);
Firebug.registerPanel(DecompileTreePanel);

}});