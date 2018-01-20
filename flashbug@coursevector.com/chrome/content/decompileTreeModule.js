/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
	"firebug/lib/domplate",
	"firebug/net/httpLib",
	"firebug/lib/string",
	"firebug/lib/trace"
],
function(Obj, Domplate, Http, Str, FBTrace) {

// ********************************************************************************************* //
// Custom Module Implementation

var trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH_DECOMPILER) FBTrace.sysout('flashbug; DecompileTreeModule - ' + msg, obj);
	},
	ERROR = function(e) {
		 if (FBTrace.DBG_FLASH_ERRORS) FBTrace.sysout('flashbug; ERROR ' + e);
	};

Flashbug.DecompileTreeModule = Obj.extend(Firebug.Module, {
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends Module
	
	dispatchName: "flashDecompilerTree",
});

// ********************************************************************************************* //
// DOMPlate Implementation

with (Domplate) {
	Flashbug.DecompileModule.Tree = domplate(Firebug.Rep, {
		tag:
			UL({'class':'flash-dec-tree'},
				FOR("file", "$swfs",
					LI({'class':'isSWF hasChildren', /*_file:'$file',*/ _fileURI:'$file|getURI', _loaded:'$file|isLoaded'},
						//IMG({"class": "flash-dec-twisty"}),
						DIV({"class": "flash-dec-twisty"}),
						A({href:'#', title:'$file|getURI', 'class':'swf'}, '$file|getName'),
						UL({'class':'tree'})
					)
				)
			),
			
		leafTag:
			LI({'class':'isSWF hasChildren', /*_file:'$file',*/ _fileURI:'$file|getURI', _loaded:'$file|isLoaded'},
				//IMG({"class": "flash-dec-twisty"}),
				DIV({"class": "flash-dec-twisty"}),
				A({href:'#', title:'$file|getURI', 'class':'swf'}, '$file|getName'),
				UL({'class':'tree'})
			),
			
		getURI: function(file) {
			if (file.URI) return file.URI.asciiSpec;
			return file.href;
		},
		
		getName: function(file) {
			return this.getURI(file).split('/').pop() + ' (' + (file.size <= 0 ? 'Loading...' : Str.formatSize(file.size)) + ')';
		},
		
		isLoaded: function(file) {
			return (file.size <= 0 ? false : true);
		}
	});
	
	Flashbug.DecompileModule.Loading = domplate(Firebug.Rep, {
		tag:
			DIV({"class": "flb-dec-loading"})
	});
	
	Flashbug.DecompileModule.Error = domplate(Firebug.Rep, {
		tag:
			LI({'class':'Error'},
				//IMG({"class": "twisty2"}),
				DIV({"class": "twisty2"}),
				A({href:'#', title:'$message', 'class':'Error'}, '$message'),
				UL({'class':'tree'})
			)
	});
	
	Flashbug.DecompileModule.SubTree = domplate(Firebug.Rep, {
		tag:
			LI({'class':'$title.type hasChildren'},
				//IMG({"class": "flash-dec-twisty"}),
				DIV({"class": "flash-dec-twisty"}),
				A({href:'#', title:'$title.name', 'class':'$title.type'}, '$title.name'),
				UL({'class':'flash-dec-tree'},
					FOR("item", "$array",
						TAG('$item|getLeafTag', {item: '$item'})
					)
				)
			),
			
		frameTag:
			LI({'class':'MovieClip hasChildren'},
				//IMG({"class": "flash-dec-twisty"}),
				DIV({"class": "flash-dec-twisty"}),
				A({href:'#', title:'$title.name', 'class':'$title.type'}, '$title.name'),
				UL({'class':'flash-dec-tree'},
					FOR("item", "$array",
						LI({'class':'MovieClip hasChildren'},
							//IMG({"class": "flash-dec-twisty"}),
							DIV({"class": "flash-dec-twisty"}),
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
			
		buttonTag:
			LI({'class':'SimpleButton hasChildren'},
				//IMG({"class": "flash-dec-twisty"}),
				DIV({"class": "flash-dec-twisty"}),
				A({href:'#', title:'$title.name', 'class':'$title.type'}, '$title.name'),
				UL({'class':'flash-dec-tree'},
					FOR("item", "$array",
						LI({'class':'SimpleButton hasChildren'},
							//IMG({"class": "flash-dec-twisty"}),
							DIV({"class": "flash-dec-twisty"}),
							A({href:'#', title:'$item.name', 'class':'SimpleButton action', _repObject:'$item.data'}, '$item.name'),
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
			if (item.data.value.header.name == 'DefineBitsJPEG4') return true;
			// defineBitsLossless 15-bit RGB image
			if (item.data.value.header.name == 'DefineBitsLossless' && item.data.value.format == 4) return true;
			// soundStreamHead2 Uncompressed, native-endian
			if (item.data.value.header.name == 'SoundStreamHead2' && item.data.value.streamSoundCompression == 0) return true;
			// soundStreamHead2 Speex
			if (item.data.value.header.name == 'SoundStreamHead2' && item.data.value.streamSoundCompression == 11) return true;
			// defineVideoStream Screen Video V2
			if (item.data.value.header.name == 'DefineVideoStream' && item.data.value.codecID == 6) return true;
			// defineVideoStream H.264
			if (item.data.value.header.name == 'DefineVideoStream' && item.data.value.codecID == 7) return true;
			
			return false;
		},
			
		getLeafTag: function(item) {
			if (item.data.value.isSWF) return this.leafTag;
			return this.nodeTag;
		},
			
		getFrameLabel: function(frame) {
			var lbl = 'Frame ' + frame.frame;
			if (frame.hasOwnProperty('label') && frame.label.length) lbl += ' (' + frame.label + ')';
			return lbl;
		}
	});
}

// ********************************************************************************************* //
// Registration

Firebug.registerRep(
	Flashbug.DecompileModule.Tree,
	Flashbug.DecompileModule.Loading,
	Flashbug.DecompileModule.Error,
	Flashbug.DecompileModule.SubTree
);
Firebug.registerModule(Flashbug.DecompileTreeModule);

return Flashbug.DecompileTreeModule;

// ********************************************************************************************* //
});