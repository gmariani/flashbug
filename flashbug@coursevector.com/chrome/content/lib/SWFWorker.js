importScripts('ByteArrayString.js', 'CFFUtil.js', 'WAVUtil.js', 'ZipUtil.js');

var config = {};
var soundStreamID = 1;
var hasSoundBlock = false;
var push = Array.prototype.push;
const BitmapType = {
	JPEG:1,
	GIF89A:2,
	PNG:3
}
const BitmapFormat = {
	BIT_8:3,
	BIT_15:4,
	BIT_24:5
}
const SoundCompression = {
	UNCOMPRESSED_NATIVE_ENDIAN:0,
	ADPCM:1,
	MP3:2,
	UNCOMPRESSED_LITTLE_ENDIAN:3,
	NELLYMOSER_16_KHZ:4,
	NELLYMOSER_8_KHZ:5,
	NELLYMOSER:6,
	SPEEX:11
}
const SoundRate = {
	KHZ_5:0,
	KHZ_11:1,
	KHZ_22:2,
	KHZ_44:3
}
const SoundSize = {
	BIT_8:0,
	BIT_16:1
}
const SoundType = {
	MONO:0,
	STEREO:1
}

const VideoCodecID = {
	H263:2,
	SCREEN:3,
	VP6:4,
	VP6ALPHA:5,
	SCREENV2:6
}

const VideoDeblockingType = {
	VIDEOPACKET:0,
	OFF:1,
	LEVEL1:2,
	LEVEL2:3,
	LEVEL3:4,
	LEVEL4:5
}

const TextStyleFlags = {
	HAS_FONT: 0x08,
	HAS_COLOR: 0x04,
	HAS_XOFFSET: 0x01,
	HAS_YOFFSET: 0x02
};

const StyleChangeStates = {
	MOVE_TO: 0x01,
	LEFT_FILL_STYLE: 0x02,
	RIGHT_FILL_STYLE: 0x04,
	LINE_STYLE: 0x08,
	NEW_STYLES: 0x10
};

const FillStyleTypes = {
	SOLID: 0x00, 
	LINEAR_GRADIENT: 0x10, 
	RADIAL_GRADIENT: 0x12,
	FOCAL_RADIAL_GRADIENT: 0x13,
	REPEATING_BITMAP: 0x40, 
	CLIPPED_BITMAP: 0x41, 
	NON_SMOOTHED_REPEATING_BITMAP: 0x42,
	NON_SMOOTHED_CLIPPED_BITMAP: 0x43
};

const SpreadModes = {
	PAD: 0,
	REFLECT: 1,
	REPEAT: 2
};

const InterpolationModes = {
	RGB: 0,
	LINEAR_RGB: 1
};

function trace2() {
	var str = '';
	var arr = [];
	for (var i = 0, l = arguments.length; i < l; i++) {
		str += arguments[i];
		arr[i] = arguments[i];
		if (i != (l - 1)) str += ', ';
	}
	str += '\n';
	
	postMessage({
        type: "debug",
        message: arr
    });
	
	dump(str);
}
function dump2(msg, obj) {
	postMessage({
        type: "debug",
		title:msg,
        data: obj
    });
}

function store(obj, tag) {
	obj.dictionary[tag.id] = obj.dictionary[tag.id] || { };
	for (var prop in tag) {
		obj.dictionary[tag.id][prop] = tag[prop];
	}
}

function readGlyph(ba, isHiRes) {
	function loRes(value) {
		if (isHiRes) return value / 20;
		return value;
	}
	
	// Convert path into SVG commands
	var numFillBits = ba.readUB(4),
		numLineBits = ba.readUB(4),
		x = 0,
		y = 0,
		cmds = [],
		c = StyleChangeStates,
		b = {left:0, right:0, top:0, bottom:0};
		
	function updateBounds(x, y) {
		if (x < b.left) b.left = x;
		if (x > b.right) b.right = x;
		if (y < b.top) b.top = y;
		if (y > b.bottom) b.bottom = y;
	}
		
	do {
		var type = ba.readUB(1),
			flags = null;
		if (type) {
			var isStraight = ba.readBool(),
				numBits = ba.readUB(4) + 2;
			if (isStraight) {
				var isGeneral = ba.readBool();
				if (isGeneral) {
					x += loRes(ba.readSB(numBits));
					y += loRes(ba.readSB(numBits));
					cmds.push('L' + x + ',' + y); // lineto
					updateBounds(x, y);
				} else {
					var isVertical = ba.readBool();
					if (isVertical) {
						y += loRes(ba.readSB(numBits));
						cmds.push('V' + y); // vertical lineto
						updateBounds(0, y);
					} else {
						x += loRes(ba.readSB(numBits));
						cmds.push('H' + x); // horizontal lineto
						updateBounds(x, 0);
					}
				}
			} else {
				var cx = x + loRes(ba.readSB(numBits)),
					cy = y + loRes(ba.readSB(numBits));
				x = cx + loRes(ba.readSB(numBits));
				y = cy + loRes(ba.readSB(numBits));
				cmds.push('Q' + cx + ',' + cy + ',' + x + ',' + y); // quadratic Bézier curveto
				updateBounds(x, y);
			}
		} else {
			var flags = ba.readUB(5);
			if (flags) {
				if (flags & c.MOVE_TO) {
					var numBits = ba.readUB(5);
					x = loRes(ba.readSB(numBits));
					y = loRes(ba.readSB(numBits));
					cmds.push('M' + x + ',' + y); // moveto
					updateBounds(x, y);
				}
				if (flags & c.LEFT_FILL_STYLE || flags & c.RIGHT_FILL_STYLE){ ba.readUB(numFillBits); }
			}
		}
	} while(type || flags);
	ba.align();
	
	// For displaying in Flashbug
	var w = (b.right - b.left),
		h = (b.bottom - b.top),
		vB = ('' + [b.left, b.top, b.right - b.left, b.bottom - b.top]);
	
	// Convert to SVG //
	cmds = cmds.join(' ');
	var svg = '<svg preserveAspectRatio="none" width="' + (w * .05) + '" height="' + (h * .05) + '" viewBox="' + vB + '">'
	svg += '<g fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision" image-rendering="optimizeQuality"  text-rendering="geometricPrecision" color-rendering="optimizeQuality">';
	svg += '<path d="' + cmds + '" fill="#000" />';
	svg += '</g></svg>';
	
	return { commands: cmds, svg: svg };
};

function readEdges(ba, fillStyles, lineStyles, withAlpha, withLineV2, morph, obj) {
	var numFillBits = ba.readUB(4),
		numLineBits = ba.readUB(4),
		x1 = 0,
		y1 = 0,
		x2 = 0,
		y2 = 0,
		seg = [],
		i = 0,
		isFirst = true,
		edges = [],
		leftFill = 0,
		rightFill = 0,
		fsOffset = 0,
		lsOffset = 0,
		leftFillEdges = {},
		rightFillEdges = {},
		line = 0,
		lineEdges = {},
		c = StyleChangeStates,
		countFChanges = 0,
		countLChanges = 0,
		useSinglePath = true;
		
	// Read Shape Records
	do {
		var type = ba.readUB(1),
			flags = null;
		if (type) {
			var isStraight = ba.readBool(),
			    numBits = ba.readUB(4) + 2,
			    cx = null,
			    cy = null;
			x1 = x2;
			y1 = y2;
			
			if (isStraight) {
				// StraightEdgeRecord
				var isGeneral = ba.readBool();
				if(isGeneral) {
				    x2 += ba.readSB(numBits);
				    y2 += ba.readSB(numBits);
				} else {
				    var isVertical = ba.readBool();
					if (isVertical) {
					    y2 += ba.readSB(numBits);
					} else {
					    x2 += ba.readSB(numBits);
					}
				}
			} else {
				// CurveEdgeRecord
				cx = x1 + ba.readSB(numBits);
				cy = y1 + ba.readSB(numBits);
				x2 = cx + ba.readSB(numBits);
				y2 = cy + ba.readSB(numBits);
			}
			
			seg.push({
				i: i++,
				f: isFirst,
				x1: x1, y1: y1,
				cx: cx, cy: cy,
				x2: x2, y2: y2
			});
			
			isFirst = false;
		} else {
			// each seg is a edge record
			if (seg.length) {
				// Add edge records to general edges array
				push.apply(edges, seg);
				
				// Add edge records that have a left fill to left fill array
				if (leftFill) {
					var idx = fsOffset + leftFill,
						list = leftFillEdges[idx] || (leftFillEdges[idx] = []);
					for (var j = 0, edge = seg[0]; edge; edge = seg[++j]) {
						var e = cloneEdge(edge),
							tx1 = e.x1,
							ty1 = e.y1;
						e.i = i++;
						e.x1 = e.x2;
						e.y1 = e.y2;
						e.x2 = tx1;
						e.y2 = ty1;
						list.push(e);
					}
				}
				
				// Add edge records that have a right fill to right fill array
				if (rightFill) {
					var idx = fsOffset + rightFill,
						list = rightFillEdges[idx] || (rightFillEdges[idx] = []);
					push.apply(list, seg);
				}
				
				// Add edge records that have a line style to line style array
				if (line) {
					var idx = lsOffset + line,
						list = lineEdges[idx] || (lineEdges[idx] = []);
					push.apply(list, seg);
				}
				
				seg = [];
				isFirst = true;
			}
			
			var flags = ba.readUB(5);
			if (flags) {
				// StyleChangeRecord
				if (flags & c.MOVE_TO) {
					var numBits = ba.readUB(5);
					x2 = ba.readSB(numBits);
					y2 = ba.readSB(numBits);
				}
				
				if (flags & c.LEFT_FILL_STYLE) {
					leftFill = ba.readUB(numFillBits);
					countFChanges++;
				}
				
				if (flags & c.RIGHT_FILL_STYLE) {
					rightFill = ba.readUB(numFillBits);
					countFChanges++;
				}
				
				if (flags & c.LINE_STYLE) {
					line = ba.readUB(numLineBits);
					countLChanges++;
				}
				
				if ((leftFill && rightFill) || countFChanges + countLChanges > 2) useSinglePath = false;
				
				if (flags & c.NEW_STYLES) {
					fsOffset = fillStyles.length;
					lsOffset = lineStyles.length;
					push.apply(fillStyles, readFillStyleArray(ba, withAlpha || morph, undefined, obj));
					push.apply(lineStyles, readLineStyleArray(ba, withAlpha || morph, withLineV2, undefined, obj));
					numFillBits = ba.readUB(4);
					numLineBits = ba.readUB(4);
					useSinglePath = false;
				}
			} else {
				// EndShapeRecord
			}
		}
	} while(type || flags);
	
	ba.align();
	
	if (useSinglePath) {
		// If single path, return object
		var fill = leftFill || rightFill;
		return {
			records: edges,
			fill: fill ? fillStyles[fsOffset + fill - 1] : null,
			line: lineStyles[lsOffset + line - 1]
		};
	} else {
		// If multipath, return array
		var segments = [], fillStyle;
		for (var i = 0; (fillStyle = fillStyles[i]); i++) {
			var fill = i + 1,
				list = leftFillEdges[fill],
				fillEdges = [],
				edgeMap = {};
				
			// Append all left fill edges to general fill edges array
			if (list) push.apply(fillEdges, list);
			
			// Append all right fill edges to general fill edges array
			list = rightFillEdges[fill];
			if (list) push.apply(fillEdges, list);
			
			for (var j = 0, edge = fillEdges[0]; edge; edge = fillEdges[++j]) {
				var key = pt2key(edge.x1, edge.y1),
					list = edgeMap[key] || (edgeMap[key] = []);
				list.push(edge);
			}
			
			var recs = [],
				countFillEdges = fillEdges.length,
				l = countFillEdges - 1;
			for (var j = 0; j < countFillEdges && !recs[l]; j++) {
				var edge = fillEdges[j];
				if (!edge.c) {
					var seg = [],
						firstKey = pt2key(edge.x1, edge.y1),
						usedMap = {};
					do {
					    seg.push(edge);
					    usedMap[edge.i] = true;
					    var key = pt2key(edge.x2, edge.y2),
						    list = edgeMap[key],
						    favEdge = fillEdges[j + 1],
						    nextEdge = null;
					    if (key == firstKey) {
							var k = seg.length;
							while (k--) {
								seg[k].c = true;
							}
							push.apply(recs, seg);
							break;
					    }
					    
					    if (!(list && list.length)) break;
						
					   var entry;
						for (var k = 0; (entry = list[k]); k++) {
							if(entry == favEdge && !entry.c) {
								list.splice(k, 1);
								nextEdge = entry;
							}
					    }
					    
					    if (!nextEdge) {
							for(var k = 0; (entry = list[k]); k++) {
								if (!(entry.c || usedMap[entry.i])) nextEdge = entry;
							}
					    }
					    edge = nextEdge;
					} while(edge);
				}
			}
			
			var l = recs.length;
			if (l) {
				segments.push({
					records: recs,
					fill: fillStyles[i],
					"_index": recs[l - 1].i
				});
			}
		}
		
		var i = lineStyles.length;
		while (i--) {
			var recs = lineEdges[i + 1];
			if (recs) {
				segments.push({
					records: recs,
					line: lineStyles[i],
					_index: recs[recs.length - 1].i
				});
			}
		}
		
		segments.sort(function(a, b) {
			return a._index - b._index;
		});
		
		
		if (segments.length > 1) {
			return segments;
		} else {
			return segments[0];
		}
	}
};

function readFillStyleArray(ba, withAlpha, morph, obj) {
	var fillStyleCount = ba.readUI8(),
		styles = [];
	if (0xFF == fillStyleCount) fillStyleCount = ba.readUI16();
	
	// Read FILLSTYLE
	while (fillStyleCount--) {
		styles.push(readFillStyle(ba, withAlpha, morph, obj, true));
	}
	return styles;
};

function readFillStyle(ba, withAlpha, morph, obj) {
	var type = ba.readUI8(),
		f = FillStyleTypes;
	
	switch(type) {
		case f.SOLID:
			if (morph) {
				return [ba.readRGBA(), ba.readRGBA()];
			} else {
				return withAlpha ? ba.readRGBA() : ba.readRGB();
			}
			break;
		case f.LINEAR_GRADIENT:
		case f.RADIAL_GRADIENT:
		case f.FOCAL_RADIAL_GRADIENT:
			var matrix = morph ? [nlizeMatrix(ba.readMatrix()), nlizeMatrix(ba.readMatrix())] : nlizeMatrix(ba.readMatrix());
			var stops = [],
				style = {
					type: type == f.LINEAR_GRADIENT ? 'linear' : 'radial',
					matrix: matrix,
					spread: morph ? SpreadModes.PAD : ba.readUB(2),
					interpolation: morph ? InterpolationModes.RGB : ba.readUB(2),
					stops: stops
				};
				
				var numStops = morph ? ba.readUI8() : ba.readUB(4);
				while(numStops--) {
					var offset = ba.readUI8() / 256,
						color = withAlpha || morph ? ba.readRGBA() : ba.readRGB();
					stops.push({
						offset: morph ? [offset, ba.readUI8() / 256] : offset,
						color: morph ? [color, ba.readRGBA()] : color
					});
				}
				
				// Not in specs but found in SWFWire...
				if (type == f.FOCAL_RADIAL_GRADIENT) style.focalPoint = ba.readFixed8();
			return style;
			break;
		case f.REPEATING_BITMAP:
		case f.CLIPPED_BITMAP:
		case f.NON_SMOOTHED_REPEATING_BITMAP:
		case f.NON_SMOOTHED_CLIPPED_BITMAP:
			var bitmapId = ba.readUI16(),
				img = obj.dictionary[bitmapId],
				bitmapMatrix = morph ? [ba.readMatrix(), ba.readMatrix()] : ba.readMatrix(),
				style = {
				type: 'pattern',
				image: img,
				matrix: bitmapMatrix,
				repeat: (type == f.REPEATING_BITMAP)
			};
			if (img) {
				//trace2('Found img ' + bitmapId, style);
			} else {
				//trace2('Unable to find img ' + bitmapId, style);
			}
			return style;
			break;
	}
	return null;
};

function readLineStyleArray(ba, withAlpha, withLineV2, morph, obj) {
	var numStyles = ba.readUI8(),
		styles = [];
	if (0xFF == numStyles) numStyles = ba.readUI16();
	
	while (numStyles--) {
		if (!withLineV2) {
			// Read LINESTYLE
			if (morph) {
				styles.push({
					width: [ba.readUI16() / 20, ba.readUI16() / 20],
					color: [ba.readRGBA(), ba.readRGBA()]
				});
			} else {
				styles.push({
					width: ba.readUI16() / 20,
					color: withAlpha ? ba.readRGBA() : ba.readRGB()
				});
			}
		} else {
			// Read LINESTYLE2
			var style = {};
			style.width = morph ? [ba.readUI16() / 20, ba.readUI16() / 20] : ba.readUI16() / 20,
			style.startCapStyle = ba.readUB(2),
			style.joinStyle = ba.readUB(2),
			style.hasFillFlag = ba.readBool(),
			style.noHScaleFlag = ba.readBool(),
			style.noVScaleFlag = ba.readBool(),
			style.pixelHintingFlag = ba.readBool();
			
			ba.readUB(5); // Reserved
			
			style.noClose = ba.readBool(),
			style.endCapStyle = ba.readUB(2);
			
			if (style.joinStyle == 2) style.miterLimitFactor = ba.readUI16();
			
			if (!style.hasFillFlag) {
				style.color = morph ? [ba.readRGBA(), ba.readRGBA()] : ba.readRGBA();
			} else {
				style.fillType = readFillStyle(ba, withAlpha, morph, obj);
			}
			styles.push(style);
		}
	}
	
	return styles;
};

function nlizeMatrix(matrix) {
	return {
		scaleX: matrix.scaleX * 20, scaleY: matrix.scaleY * 20,
		skewX: matrix.skewX * 20, skewY: matrix.skewY * 20,
		moveX: matrix.moveX, moveY: matrix.moveY
	};
}

function cloneEdge(edge) {
	return {
		i: edge.i,
		f: edge.f,
		x1: edge.x1, y1: edge.y1,
		cx: edge.cx, cy: edge.cy,
		x2: edge.x2, y2: edge.y2
	};
}

function pt2key(x, y) {
	return (x + 50000) * 100000 + y;
}

function twip2px(n) {
	return n /20;
}

function edges2cmds(edges, stroke) {
	var firstEdge = edges[0],
		x1 = 0,
		y1 = 0,
		x2 = 0,
		y2 = 0,
		cmds = [];
		
	/*
	The following commands are available for path data:

	M = moveto
	L = lineto
	H = horizontal lineto
	V = vertical lineto
	C = curveto
	S = smooth curveto
	Q = quadratic Belzier curve
	T = smooth quadratic Belzier curveto
	A = elliptical Arc
	Z = closepath
	*/
	
	if (firstEdge) {
		for(var i = 0, edge = firstEdge; edge; edge = edges[++i]) {
			x1 = edge.x1;
			y1 = edge.y1;
			if (x1 != x2 || y1 != y2 || !i) cmds.push('M' + twip2px(x1) + ',' + twip2px(y1));
			x2 = edge.x2;
			y2 = edge.y2;
			if (null == edge.cx || null == edge.cy) {
				if (x2 == x1) {
					cmds.push('V' + twip2px(y2));
				} else if (y2 == y1) {
					cmds.push('H' + twip2px(x2));
				} else {
					cmds.push('L' + twip2px(x2) + ',' + twip2px(y2));
				}
			} else {
				cmds.push('Q' + twip2px(edge.cx) + ',' + twip2px(edge.cy) + ',' + twip2px(x2) + ',' + twip2px(y2));
			}
		};
		if (!stroke && (x2 != firstEdge.x1 || y2 != firstEdge.y1)) cmds.push('L' + twip2px(firstEdge.x1) + ',' + twip2px(firstEdge.y1));
	}
	return cmds.join(' ');
};

function getStyle(fill, line, id, morphIdx) {
	var t = this,
		attrs = {};
		
	var fillAttr = '';
	if (fill) {
		var type = fill.type;
		if (fill.type) {
			fillAttr += ' fill="url(#' + id + 'gradFill)"';
		} else {
			fill = fill instanceof Array ? fill[morphIdx] : fill;
			var color = fill,
				alpha = color.alpha;
			fillAttr += ' fill="' + getColor(color, true) + '"';
			if (undefined != alpha && alpha < 1) fillAttr += ' fill-opacity="' + alpha + '"';
		}
	} else {
		fillAttr += ' fill="none"';
	}
	
	if (line) {
		if (line.hasFillFlag) {
			// Filled line, gradient line
			fillAttr += ' stroke="url(#' + id + 'gradFill)"';
			fillAttr += ' stroke-width="' + max(line.width, 1) + '"';
		} else {
			var color = line.color instanceof Array ? line.color[morphIdx] : line.color,
				width = line.width instanceof Array ? line.width[morphIdx] : line.width,
				alpha = color.alpha;
			fillAttr += ' stroke="' + getColor(color, true) + '"';
			fillAttr += ' stroke-width="' + max(width, 1) + '"';
			if (undefined != alpha && alpha < 1) fillAttr += ' stroke-opacity="' + alpha + '"';
		}
		
		if (line.hasOwnProperty('joinStyle') && line.joinStyle == 2) fillAttr += ' stroke-miterlimit="' + line.miterLimitFactor + '"'; // Miter limit factor is an 8.8 fixed-point value.
		
		if (line.hasOwnProperty('startCapStyle') && line.startCapStyle instanceof Number) {
			var lineCap = ['butt','round', 'square'];
			fillAttr += ' stroke-linecap="' + lineCap[line.startCapStyle] + '"'; // endCapStyle ignored for now
		}
		
		if (line.hasOwnProperty('joinStyle') && line.joinStyle instanceof Number) {
			var lineJoin = ['round','bevel','miter'];
			fillAttr += ' stroke-linejoin="' + lineJoin[line.joinStyle] + '"';
		}
	}
	
	return fillAttr;
};

function getFill(fill, id, morphIdx) {
	var t = this,
		type = fill.type,
		svg = '';
		
	switch(type) {
		case "linear":
		case "radial":
			svg += '<' + type + 'Gradient';
			svg += ' id="' + id + 'gradFill"';
			svg += ' gradientUnits="userSpaceOnUse"';
			svg += ' gradientTransform="' + getMatrix(fill.matrix, morphIdx) + '"';
			var s = SpreadModes,
				i = InterpolationModes,
				stops = fill.stops;
			if (type == 'linear') {
				svg += ' x1="-819.2"'; 
				svg += ' x2="819.2"'; 
			} else {
				svg += ' cx="0"'; 
				svg += ' cy="0"'; 
				svg += ' r="819.2"'; 
			}
			
			switch (fill.spread) {
				case s.REFLECT:
					svg += ' spreadMethod="reflect"';
					break;
				case s.REPEAT:
					svg += ' spreadMethod="repeat"';
					break;
			}
			
			if (fill.interpolation == i.LINEAR_RGB) svg += ' color-interpolation="linearRGB"';
			
			svg += '>';
			
			stops.forEach(function(stop) {
				svg += '<stop';
				var color = stop.color instanceof Array ? stop.color[morphIdx] : stop.color,
					offset = stop.offset instanceof Array ? stop.offset[morphIdx] : stop.offset;
				svg += ' offset="' + stop.offset + '"';
				svg += ' stop-color="' + getColor(color, true) + '"';
				svg += ' stop-opacity="' + (!color.hasOwnProperty('alpha') ? 1 : color.alpha) + '"';
				svg += ' />'
			});
			
			svg += '</' + type + 'Gradient>';
			
			break;
		case "pattern":
			svg += '<g id="' + id + 'patternFill">';
			//svg += '<rect transform="' + getMatrix(fill.matrix, morphIdx) + '"  width="' + fill.image.width + '" height="' + fill.image.height + '" y="0" x="0" fill="#ff0000"/>';
			
		
			svg += '<image';
			//svg += ' id="' + id + 'patternFill"';
			svg += ' transform="' + getMatrix(fill.matrix, morphIdx) + '"';
			svg += ' width="' + fill.image.width + '"';
			svg += ' height="' + fill.image.height + '"';
			
			/*var node = t._createElement("image"),
				width = obj.width,
				height = obj.height;
			if (obj.data) {
				var s = new Gordon.Stream(obj.data),
					dataSize = width * height * 4,
					canvas = doc.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				var ctx = canvas.getContext("2d"),
					imgData = ctx.createImageData(width, height),
					data = imgData.data;
				for(var i = 0; i < dataSize; i += 4){
					data[i] = s.readUI8();
					data[i + 1] = s.readUI8();
					data[i + 2] = s.readUI8();
					data[i + 3] = 255;
				}
				ctx.putImageData(imgData, 0, 0);
				var uri = canvas.toDataURL();
			} else { var uri = obj.uri; }*/
			svg += ' xlink:href="$$$_' + fill.image.id + '_URI$$$"';
			svg += '/>';
			
			svg += '</g>';
			break;
	}
	
	return svg;
};

function getMatrix(matrix, morphIdx) {
	matrix = matrix instanceof Array ? matrix[morphIdx] : matrix;
	return "matrix(" + [
		matrix.scaleX, matrix.skewX,
		matrix.skewY, matrix.scaleY,
		matrix.moveX, matrix.moveY
	] + ')';
};

function getColor(color) {
	return 'rgb(' + [color.red, color.green, + color.blue] + ')';
};

function union(rect1, rect2) {
	return {
			left: rect1.left < rect2.left ? rect1.left : rect2.left,
			right: rect1.right > rect2.right ? rect1.right : rect2.right,
			top: rect1.top < rect2.top ? rect1.top : rect2.top,
			bottom: rect1.bottom > rect2.bottom ? rect1.bottom : rect2.bottom
		};
};

// TODO Figure out how to process a shape with multiple edge records, error at line 845, records doesn't exist
/*
Normal: start.edges{records, fill, line}
Multipath: start.edges[{records, fill, _index}, {records, line, _index}]
*/
function morph2SVG(shp) {
	shp.start.fill = shp.start.edges.fill;
	shp.start.line = shp.start.edges.line;
	shp.start.commands = edges2cmds(shp.start.edges.records, !!shp.start.line);
	
	shp.end.fill = shp.start.edges.fill;
	shp.end.line = shp.start.edges.line;
	shp.end.commands = edges2cmds(shp.end.edges.records, !!shp.end.line);
	// Union bounds
	shp.bounds = union(shp.start.bounds, shp.end.bounds);
	
	// Convert to SVG //
	var b = shp.bounds,
		morphIdx = 0,
		startSegments = shp.start.segments,
		endSegments = shp.end.segments,
		svg = '',
		cmds = '',
		defs = '<defs>';
	
	// SVG Header
	svg += '<g fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision" image-rendering="optimizeQuality"  text-rendering="geometricPrecision" color-rendering="optimizeQuality">';
	
	// SVG Body
	if (!startSegments) startSegments = [shp.start];
	if (!endSegments) endSegments = [shp.end];
	for (var i = 0; i < startSegments.length; i++) {
		var startSeg = startSegments[i],
			endSeg = endSegments[i],
			id = startSeg.id,
			fill = startSeg.fill,
			line = startSeg.line;
			
		if (fill && 'pattern' == fill.type && !fill.repeat) {
			defs += getFill(fill, id, morphIdx);
			cmds += '<use xlink:href="#' + id + 'patternFill" transform="' + getMatrix(fill.matrix, morphIdx) + '" />';
		} else {
			if (fill && 'pattern' != fill.type) defs += getFill(fill, id, morphIdx);
			if (line && line.hasFillFlag) defs += getFill(line.fillType, id, morphIdx);
			cmds += '<path id="' + id + '" d="' + startSeg.commands + '"' + getStyle(fill, line, id, morphIdx) + '>';
			cmds += '<animate dur="10s" repeatCount="indefinite" attributeName="d" values="' + startSeg.commands + '; ' + endSeg.commands + '; ' + endSeg.commands + '" />';
			cmds += '</path>';
		}
	}
	
	// SVG Footer
	defs += '</defs>';
	svg += defs;
	svg += cmds;
	svg += '</g></svg>';
	
	// For displaying in Flashbug
	var w = (b.right - b.left),
		h = (b.bottom - b.top),
		vB = ('' + [b.left, b.top, b.right - b.left, b.bottom - b.top]);
	
	shp.svgHeaderThumb = '<svg preserveAspectRatio="none" width="' + w + '" height="' + h + '" viewBox="' + vB + '">';
	// For export
	shp.svgHeader = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="none" width="' + w + '" height="' + h + '" viewBox="' + vB + '">';
	shp.data = svg;
};

function shape2SVG(shp) {
	// Convert to SVG //
	var segments = shp.segments,
		b = shp.bounds,
		svg = '',
		cmds = '',
		defs = '<defs>';
	
	// SVG Header
	svg += '<g fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision" image-rendering="optimizeQuality"  text-rendering="geometricPrecision" color-rendering="optimizeQuality">';
	
	if (!segments) segments = [shp];
	for (var i = 0, seg = segments[0]; seg; seg = segments[++i]) {
		var id = seg.id,
			fill = seg.fill,
			line = seg.line;
		
		if (fill && 'pattern' == fill.type && !fill.repeat) {
			defs += getFill(fill, id);
			cmds += '<use xlink:href="#' + id + 'patternFill" />';
		} else {
			if (fill && 'pattern' != fill.type) defs += getFill(fill, id);
			if (line && line.hasFillFlag) defs += getFill(line.fillType, id);
			cmds += '<path id="' + id + '" d="' + seg.commands + '"' + getStyle(fill, line, id) + ' />';
		}
	}
	
	// SVG Footer
	defs += '</defs>';
	svg += defs;
	svg += cmds;
	svg += '</g></svg>';
	
	// For displaying in Flashbug
	var w = (b.right - b.left),
		h = (b.bottom - b.top),
		vB = ('' + [b.left, b.top, b.right - b.left, b.bottom - b.top]);
	
	shp.svgHeaderThumb = '<svg preserveAspectRatio="none" width="' + w + '" height="' + h + '" viewBox="' + vB + '">';
	// For export
	shp.svgHeader = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="none" width="' + w + '" height="' + h + '" viewBox="' + vB + '">';
	shp.data = svg;
};

// From Firebug Lib //
function formatSize(bytes) {

    // Get size precision (number of decimal places from the preferences)
    // and make sure it's within limits.
    var sizePrecision = 2;
    sizePrecision = (sizePrecision > 2) ? 2 : sizePrecision;
    sizePrecision = (sizePrecision < -1) ? -1 : sizePrecision;

    if (sizePrecision == -1) return bytes + " B";

    var a = Math.pow(10, sizePrecision);

    if (bytes == -1 || bytes == undefined) {
        return "?";
    } else if (bytes == 0) {
        return "0";
    } else if (bytes < 1024) {
        return bytes + " B";
    } else if (bytes < (1024*1024)) {
        return Math.round((bytes/1024)*a)/a + " KB";
	} else {
        return Math.round((bytes/(1024*1024))*a)/a + " MB";
	}
}

function formatNumber(number) {
    number += "";
    var x = number.split(".");
    var x1 = x[0];
    var x2 = x.length > 1 ? "." + x[1] : "";
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
        x1 = x1.replace(rgx, "$1" + "," + "$2");
	}
    return x1 + x2;
}

/////////////////////////////////////////////////////////
// Tags
/////////////////////////////////////////////////////////

// Type 0
function readEnd(obj, tag, ba) {
	//if(hasSoundBlock) streams.pop();
	obj.stage.pop();
};

// Type 1
function readShowFrame(obj, tag, ba) {
	obj.frameIndex++;
	obj.stage.push(new Frame());
};

// Type 2
function readDefineShape(obj, tag, ba, withAlpha, withLineV2) {
	
	// Read Shape //
	var id = ba.readUI16(),
		t = this,
		shp = {
			type: "Shape",
			id: id,
			data: '',
			bounds: ba.readRect()
		};
		
	shp.bounds.left /= 20; /* twips */
	shp.bounds.right /= 20; /* twips */
	shp.bounds.top /= 20; /* twips */
	shp.bounds.bottom /= 20; /* twips */
	
	ba.align();
	
	if (withLineV2) {
		shp.edgeBounds = ba.readRect();
		shp.edgeBounds.left /= 20; /* twips */
		shp.edgeBounds.right /= 20; /* twips */
		shp.edgeBounds.top /= 20; /* twips */
		shp.edgeBounds.bottom /= 20; /* twips */
		ba.readUB(5); // Reserved
		shp.usesFillWindingRule = ba.readBool();
		shp.usesNonScalingStrokes = ba.readBool();
		shp.usesScalingStrokes = ba.readBool();
		ba.align();
	}
	
	// SHAPEWITHSTYLE //
	var fillStyles = readFillStyleArray(ba, withAlpha, undefined, obj),
		lineStyles = readLineStyleArray(ba, withAlpha, withLineV2, undefined, obj),
		edges = readEdges(ba, fillStyles, lineStyles, withAlpha, withLineV2, undefined, obj);
		
	if (edges instanceof Array) {
		var segments = shp.segments = [];
		for (var i = 0, seg = edges[0]; seg; seg = edges[++i]) {
			segments.push({
				type: 'Shape',
				id: id + '-' + (i + 1),
				commands: edges2cmds(seg.records, !!seg.line),
				fill: seg.fill,
				line: seg.line
			});
		}
	} else if (edges) {
		shp.commands = edges2cmds(edges.records, !!edges.line);
		shp.fill = edges.fill;
		shp.line = edges.line;
	}
	//
	
	shape2SVG(shp);
	
	if (withAlpha && withLineV2) {
		shp.tag = 'defineShape4';
	} else if(withAlpha) {
		shp.tag = 'defineShape3';
	} else {
		shp.tag = 'defineShape';
	}
	
	store(obj, shp);
	
	if(typeof obj.shapes == "undefined") obj.shapes = [];
	obj.shapes.push(shp);
	
	return shp;
};

// Type 4
function readPlaceObject(obj, tag, ba) {
	obj.stage = obj.stage || [];
	var o = {
		id: ba.readUI16(),
		depth: ba.readUI16(),
		matrix: ba.readMatrix(),
		frame: obj.frameIndex
	};
	
	// If there is still data to read, assume it's a cxform
	if (tag.contentLength - (ba.position - startPos) > 0) o.colorTransform = ba.readCXForm();
	
	obj.stage.push(o);
}

// Type 6
/*
This tag defines a bitmap character with JPEG compression. It contains only the JPEG
compressed image data (from the Frame Header onward). A separate JPEGTables tag contains
the JPEG encoding data used to encode this image (the Tables/Misc segment).
The data in this tag begins with the JPEG SOI marker 0xFF, 0xD8 and ends with the EOI
marker 0xFF, 0xD9. Before version 8 of the SWF file format, SWF files could contain an
erroneous header of 0xFF, 0xD9, 0xFF, 0xD8 before the JPEG SOI marker.

NOTE: Only one JPEGTables tag is allowed in a SWF file, and thus all bitmaps defined with
DefineBits must share common encoding tables.

The minimum file format version for this tag is SWF 1.
*/
function readImageInfo(data) {
	var img = new Flashbug.ByteArrayString(data);
	
	// JPEG
	img.position = 0;
	if (img.readUI16() == 0xFFD8) {
		var w = 0,
			h = 0,
			comps = 0,
			len = img.length;
		while (img.position < len) {
			var marker = img.readUI16();
			if (marker == 0xFFC0) {
				img.readUI16(); // Length
				img.readUI8(); // Bit Depth
				h = img.readUI16();
				w = img.readUI16();
				break;
			} else if (marker != 0xFFD8 && marker != 0xFFD9) {
				img.position += img.readUI16(); // Length
			}
		}
		
		return {
			format : "JPEG",
			width : w,
			height : h,
			bpp : comps * 8,
		}
	}
	
	// PNG
	// If ImageData begins with the eight bytes 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
	img.position = 0;
	if (img.readUI8() == 0x89 && img.readUTFBytes(3) == "PNG") {
		img.position = 16;
		var w = img.readUI32(),
			h = img.readUI32(),
			bpc = img.readUI8(),
			ct = img.readUI8(),
			bpp = bpc;
			
		if (ct == 4) bpp *= 2;
		if (ct == 2) bpp *= 3;
		if (ct == 6) bpp *= 4;

		var alpha = ct >= 4;
		return {
			format : "PNG",
			width : w,
			height : h,
			bpp : bpp,
			alpha : alpha
		}
	}
	
	// GIF
	// If ImageData begins with the six bytes 0x47 0x49 0x46 0x38 0x39 0x61
	img.position = 0;
	if (img.readUTFBytes(3) == "GIF") {
		var version = img.readUTFBytes(3),
			w = img.readUI16(),
			h = img.readUI16(),
			bpp = ((img.readUI8() >> 4) & 7) + 1;

		return {
			format : "GIF89a",
			version : version,
			width : w,
			height : h,
			bpp : bpp,
		}
	}
	
	return {
			format : '?',
			width : 0,
			height : 0,
		}
};
function readDefineBits(obj, tag, ba, withAlpha, withDeblock) {
	var id = ba.readUI16(), 
		h = obj.jpegTables,
		alphaDataOffset,
		img = {};
	img.type = 'Image';
	img.id = id;
	img.imageType = withAlpha ? "PNG" : "JPEG";
	img.width = 0;
	img.height = 0;
	
	/*
	ZLIB compressed array of alpha data. Only supported when tag contains JPEG data. One byte per pixel. Total size
	after decompression must equal (width * height) of JPEG image.
	*/
	if (withAlpha) alphaDataOffset = ba.readUI32();
	
	/*
	Parameter to be fed into the deblocking filter. The parameter describes a relative strength of the deblocking filter from 
	0-100% expressed in a normalized 8.8 fixed point format.
	*/
	if (withDeblock) img.deblockParam = ba.readFixed8();
	
	if (withAlpha) {
		var data = ba.readString(alphaDataOffset);
		var alphaData = ba.readBytes(tag.contentLength - alphaDataOffset - 6);
		//img.alphaData = (new Flashbug.ByteArrayString(alphaData)).unzip(true);
		img.alphaData = new Flashbug.ZipUtil(new Flashbug.ByteArrayString(alphaData)).unzip(true);
	} else {
		var data = ba.readBytes(tag.contentLength - 2);
		
		// Before version 8 of the SWF file format, SWF files could contain an erroneous header of 0xFF, 0xD9, 0xFF, 0xD8 before the JPEG SOI marker.
		function getByte(idx) { return data.charCodeAt(idx); }
		if (getByte(0) == 0xFF && getByte(1) == 0xD9 && getByte(2) == 0xFF && getByte(3) == 0xD8) data = data.substr(4);
	}
	
	img.data = h ? h.substr(0, h.length - 2) + data.substr(2) : data;
	
	// Fix multiple SOI and EOI in JPEG data in SPL files (Flash 5)
	img.data = img.data.replace(/[^ÿØ]ÿØ/g, ''); // Make sure only one SOI and it's at the beginning
	img.data = img.data.replace(/ÿÙ(?=[ÿ])/g, ''); // Make sure only one EOI and it's at the end
	
	// Determine dimensions
	img.meta = readImageInfo(img.data);
	img.width = img.meta.width;
	img.height = img.meta.height;
	img.imageType = img.meta.format;
	
	if (withAlpha && withDeblock) {
		img.tag = 'defineBitsJPEG4';
	} else if (withAlpha) {
		img.tag = 'defineBitsJPEG3';
	} else {
		img.tag = 'defineBits';
	}
	
	store(obj, img);
	
	obj.images = obj.images || [];
	obj.images.push(img);
	
	return img;
};

// Type 8
/*
This tag defines the JPEG encoding table (the Tables/Misc segment) for all JPEG images
defined using the DefineBits tag. There may only be one JPEGTables tag in a SWF file.
The data in this tag begins with the JPEG SOI marker 0xFF, 0xD8 and ends with the EOI
marker 0xFF, 0xD9. Before version 8 of the SWF file format, SWF files could contain an
erroneous header of 0xFF, 0xD9, 0xFF, 0xD8 before the JPEG SOI marker.
The minimum file format version for this tag is SWF 1.
*/
function readJPEGTables(obj, tag, ba) {
	obj.jpegTables = ba.readBytes(tag.contentLength);
};

// Type 9
function readSetBackgroundColor(obj, tag, ba) {
	obj.backgroundColor = ba.readRGB();
};

// Type 10
function readDefineFont(obj, tag, ba) {
	var font = {};
	font.type = 'Font';
	font.id = ba.readUI16();
	font.numGlyphs = ba.readUI16() / 2;
	font.glyphShapeTable = [];
	font.offsetTable = [font.numGlyphs * 2];
	font.info = {};
	font.info.codeTable = [];
	font.tag = 'defineFont';
	font.dataSize = tag.contentLength;
	
	var i = font.numGlyphs - 1;
	while (i--) { font.offsetTable.push(ba.readUI16()); }
	
	i = font.numGlyphs;
	while (i--) { font.glyphShapeTable.push(readGlyph(ba)); }
	
	store(obj, font);
	
	obj.fonts = obj.fonts || [];
	obj.fonts.push(font);
};

// Type 11
function readDefineText(obj, tag, ba, withAlpha) {
	var id = ba.readUI16(),
		strings = [],
		txt = {
			type: "Text",
			id: id,
			tag: 'defineText',
			bounds: ba.readRect(),
			matrix: ba.readMatrix(),
			strings: strings,
			colors: [],
			glyphBits: ba.readUI8(),
			advanceBits: ba.readUI8()
		},
		fontID = null,
		font = null,
		textColor = null,
		x = 0,
		y = 0,
		textHeight = 0,
		str = null;
		
	txt.bounds.left /= 20;
	txt.bounds.right /= 20;
	txt.bounds.top /= 20;
	txt.bounds.bottom /= 20;
		
	if (withAlpha) tag = 'defineText2';
		
	// Get glpyhs
	do {
		var hdr = ba.readUI8();
		if (hdr) {
			ba.position--;
			
			// TextRecord
			ba.readBool(); // TextRecordType, always 1
			ba.readUB(3); // StyleFlagsReserved, always 0
			
			var styleFlagsHasFont = ba.readBool(),
				styleFlagsHasColor = ba.readBool(),
				styleFlagsHasYOffset = ba.readBool(),
				styleFlagsHasXOffset = ba.readBool();
				ba.align();
				
			if (styleFlagsHasFont) {
				fontID = ba.readUI16();
				if (fontID && obj.dictionary[fontID]) font =  obj.dictionary[fontID];
			}
			if (styleFlagsHasColor) textColor = withAlpha ? ba.readRGBA() : ba.readRGB();
			if (styleFlagsHasXOffset) x = ba.readSI16();
			if (styleFlagsHasYOffset) y = ba.readSI16();
			if (styleFlagsHasFont) textHeight = ba.readUI16();
			
			str = {};
			str.fontID = fontID;
			str.font = font && font.info ? font.info.name : '';
			str.textColor = textColor;
			str.x = x;
			str.y = y;
			str.textHeight = textHeight / 20 /* twips */;
			str.glyphCount = ba.readUI8();
			str.glyphEntries = [];
			
			// GlyphEntry
			var i = str.glyphCount;
			while (i--) {
				var idx = ba.readUB(txt.glyphBits),
					adv = ba.readUB(txt.advanceBits);
				str.glyphEntries.push({
					index: idx,
					advance: adv
				});
				x += adv;
			}
			ba.align();
			
			strings.push(str);
		}
	} while(hdr);
	
	// Extract text from glyphs/font
	var colors = {};
	function zero(n) {
		if (n.length < 2) return '0' + n;
		return n;
	}
	function getHex(color) {
		var str = '#';
		str += zero(color.red.toString(16));
		str += zero(color.green.toString(16));
		str += zero(color.blue.toString(16));
		if (color.hasOwnProperty('alpha')) str += zero((color.alpha * 255).toString(16));
		return str.toUpperCase();
	}
	
	for(var i = 0, string = strings[0]; string; string = strings[++i]) {
		var entries = string.glyphEntries,
			font = obj.dictionary[string.fontID];
			
			if (!font.info) continue;
			var codes = font.info.codeTable,
			chars = [];
		for(var j = 0, entry = entries[0]; entry; entry = entries[++j]){
			var str = fromCharCode(codes[entry.index]);
			if(' ' != str || chars.length) chars.push(str);
		}
		colors[getHex(string.textColor)] = string.textColor;
		string.text = chars.join('');
	}
	
	// Get just unique colors
	for (var i in colors) {
		txt.colors.push(colors[i]);
	}
	
	store(obj, txt);
	
	obj.text = obj.text || [];
	obj.text.push(txt);
};

// Type 12
/*
DoAction instructs Flash Player to perform a list of actions when the current frame is
complete. The actions are performed when the ShowFrame tag is encountered, regardless of
where in the frame the DoAction tag appears.
*/
function readDoAction(obj, tag, ba) {
	var actionsRaw = [], code;
	while ((code = ba.readUI8())) { // Action Code or ActionEndFlag
		var o = readActionRecord(code, ba);
		actionsRaw.push(o);
	}
	//trace2('actionsraw', actionsRaw);
	var as = actionsRaw.length ? convertActions(actionsRaw) : [];
	var frameAS = {type:'ActionScript', frame:obj.frameIndex, actions:actionsRaw, actionscript:as};
	if (obj.frames[obj.frameIndex]) {
		if (obj.frames[obj.frameIndex].length) {
			// Multiple
			if (!obj.frames[obj.frameIndex][obj.frames[obj.frameIndex].length - 1].actions) {
				// Frame Label
				frameAS.label = obj.frames[obj.frameIndex][obj.frames[obj.frameIndex].length - 1].label;
				obj.frames[obj.frameIndex][obj.frames[obj.frameIndex].length - 1] = frameAS;
			} else {
				// FrameAS
				obj.frames[obj.frameIndex].push(frameAS);
			}
		} else {
			// Single
			if (!obj.frames[obj.frameIndex].actions) {
				// Frame Label
				frameAS.label = obj.frames[obj.frameIndex].label;
				obj.frames[obj.frameIndex] = frameAS;
			} else {
				// FrameAS
				obj.frames[obj.frameIndex] = [obj.frames[obj.frameIndex], frameAS];
			}
		}
	} else {
		// Empty
		obj.frames[obj.frameIndex] = frameAS;
	}
};

function strip(str) {
	if (!str) return str;
	return str.toString().indexOf('"') != -1 ? str.toString().split('"')[1] : str;
}

const PROPERTIES = [
	'_x',
	'_y',
	'_xscale',    
	'_yscale',
	'_currentframe',
	'_totalframes',
	'_alpha',
	'_visible',
	'_width',
	'_height',
	'_rotation',
	'_target',
	'_framesloaded',
	'_name',
	'_droptarget',
	'_url',
	'_highquality',
	'_focusrect',
	'_soundbuftime',
	'_quality',
	'_xmouse',
	'_ymouse'
];

function convertActions(actionsRaw) {
	var pool, stack = [], branches = [], register = [];
	for (var i = 0, l = actionsRaw.length; i < l; i++) {
		var o = actionsRaw[i], act = o.action;
		
		//trace2('act ' + act, o);
		// Flash 1,2,3 //	
		if (act == 'ActionPlay') {
			var last = stack.length - 1;
			if (stack.length && stack[last].indexOf('gotoFrame') != -1) {
				stack.push(stack.pop().replace('gotoFrame', 'gotoAndPlay'));
			} if (stack.length && stack[last].indexOf('gotoLabel') != -1) {
				stack.push(stack.pop().replace('gotoLabel', 'gotoAndPlay'));
			} else {
				stack.push('play();');
			}
		} else if (act == 'ActionStop') {
			var last = stack.length - 1;
			if (stack.length && stack[last].indexOf('gotoFrame') != -1) {
				stack.push(stack.pop().replace('gotoFrame', 'gotoAndStop'));
			} if (stack.length && stack[last].indexOf('gotoLabel') != -1) {
				stack.push(stack.pop().replace('gotoLabel', 'gotoAndStop'));
			} else {
				stack.push('stop();');
			}
		} else if (act == 'ActionNextFrame') {
			stack.push('nextFrame();');
		} else if (act == 'ActionPreviousFrame') {
			stack.push('previousFrame();');
		} else if (act == 'ActionGotoFrame') {
			stack.push('gotoFrame(' + o.frame + ');');
		} else if (act == 'ActionGoToLabel') {
			stack.push('gotoLabel(' + o.label + ');');
		} else if (act == 'ActionWaitForFrame') {
			// ??
		} else if (act == 'ActionGetURL') {
			var target = o.targetString, url = o.urlString;
			if (url.indexOf('FSCommand') == 0) {
				url = url.replace('FSCommand:', '');
				stack.push('fscommand("' + url + '", "' + target + '");');
			} else {
				stack.push('getURL("' + url + '", "' + target + '");');
			}
		} else if (act == 'ActionStopSounds') {
			stack.push('stopAllSounds();');
		} else if (act == 'ActionToggleQuality') {
			stack.push('togglQuality();');
		} else if (act == 'ActionSetTarget') {
			if (o.targetName != '') {
				stack.push("tellTarget('" + o.targetName + "') {");
			} else {
				stack.push("}");
			}
			
		// Flash 4 //
		} else if (act == 'ActionAdd' || act == 'ActionAdd2') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' + ' + a);
		} else if (act == 'ActionSubtract') {
			var a = stack.pop(),
				b = stack.pop();
			stack.push(b + ' - ' + a);
		} else if (act == 'ActionMultiply') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' * ' + a);
		} else if (act == 'ActionDivide') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' / ' + a);
		} else if (act == 'ActionEquals' || act == 'ActionEquals2') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' == ' + a);
		} else if (act == 'ActionLess') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' < ' + a);
		} else if (act == 'ActionAnd') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' && ' + a);
		} else if (act == 'ActionNot') {
			//
		} else if (act == 'ActionOr') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' || ' + a);
		} else if (act == 'ActionStringAdd') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' add ' + a);
		} else if (act == 'ActionStringEquals') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' eq ' + a);
		} else if (act == 'ActionStringExtract') {
			var count = stack.pop(),
				index = stack.pop(),
				str = stack.pop(); // leave '
			stack.push('substring(' + str + ', ' + index + ', ' + count + ')');
		} else if (act == 'ActionStringLength') {
			var str = stack.pop(); // leave '
			stack.push('length(' + str + ')');
		} else if (act == 'ActionMBStringExtract') {
			//
		} else if (act == 'ActionMBStringLength') {
			//
		} else if (act == 'ActionStringLess') {
			//
		} else if(act == 'ActionPop') {
			//stack.pop(); // Ruins the stack
		} else if (act == 'ActionPush') {
			//trace2('ActionPush', o);
			for (var j = 0, l2 = o.stack.length; j < l2; j++) {
				if (o.stack[j].type == 'constant') {
					//trace2('ActionPush (const): ' + pool[o.stack[j].value]);
					stack.push('"' + pool[o.stack[j].value] + '"');
				} else if (o.stack[j].type == 'register') {
					//trace2('ActionPush (reg)a: ' + o.stack[j].value, register);
					//trace2('ActionPush (reg)b: ' + register);
					stack.push(o.stack[j].value);
					//trace2('ActionPush (reg)c: ' + stack, stack);
				} else {
					var val = o.stack[j].type == 'string' ? '"' + o.stack[j].value + '"' : o.stack[j].value;
					//trace2('ActionPush : ' + val);
					stack.push(val);
				}
			}
		} else if (act == 'ActionAsciiToChar') {
			//
		} else if (act == 'ActionCharToAscii') {
			//
		} else if (act == 'ActionToInteger') {
			var a = stack.pop();
			stack.push('int(' + a + ')');
		} else if (act == 'ActionMBAsciiToChar') {
			//
		} else if (act == 'ActionMBCharToAscii') {
			//
		} else if (act == 'ActionCall') {
			var frame = stack.pop();
			stack.push('call(' + frame + ');');
		} else if (act == 'ActionIf') {
			var condition = stack.pop();
			stack.push('if (' + condition + ') {');
			branches.push(o.pos + o.branchOffset);
		} else if (act == 'ActionJump') {
			branches.pop();
			stack.push('} else {');
			branches.push(o.pos + o.branchOffset);
		} else if (act == 'ActionGetVariable') {
			stack[stack.length - 1] = strip(stack[stack.length - 1]);
			//trace2('ActionGetVariable : ' + stack[stack.length - 1]);
		} else if (act == 'ActionSetVariable') {
			var value = stack.pop(),
				target = stack.pop();
			if (target.indexOf(' add ') != -1) {
				stack.push('set(' + target + ', ' + value + ');');
			} else {
				stack.push(strip(target) + ' = ' + value + ';');
			}
		} else if (act == 'ActionGetURL2') {
			var target = strip(stack.pop()).replace('_level', ''), // This is automatically added at compilation
				url = stack.pop();
			stack.push('loadMovieNum(' + url + ', ' + target + ')');
		} else if (act == 'ActionGetProperty') {
			var index = stack.pop(),
				target = stack.pop();
			stack.push('getProperty(' + target + ', ' + PROPERTIES[index] + ');');
		} else if (act == 'ActionGotoFrame2') {
			var frame = stack.pop();
			if (o.sceneBiasFlag) frame += o.sceneBias;
			if (o.playFlag) {
				stack.push('gotoAndPlay(' + frame + ');');
			} else {
				stack.push('gotoAndStop(' + frame + ');');
			}
		} else if (act == 'ActionRemoveSprite') {
			var a = stack.pop();
			stack.push('removeMovieClip(' + a + ');');
		} else if (act == 'ActionSetProperty') {
			var value = stack.pop(),
				index = stack.pop(),
				target = stack.pop();
			stack.push('setProperty(' + target + ', ' + PROPERTIES[index] + ', ' + value + ');');
		} else if (act == 'ActionSetTarget2') {
			var targetName = stack.pop();
			if (targetName != '') {
				stack.push("tellTarget('" + targetName + "') {");
			} else {
				stack.push("}");
			}
			target = o.targetName;
		} else if (act == 'ActionStartDrag') {
			// target, lockcenter
			var args = [stack.pop(), stack.pop()],
				constrain = stack.pop();
			if (constrain != 0) {
				// y2, x2, y1, x1
				args.push(stack.pop(), stack.pop(), stack.pop(), stack.pop());
			}
			stack.push('startDrag(' + args.join(', ') + ');');
		
		} else if (act == 'ActionWaitForFrame2') {
			//
		} else if (act == 'ActionCloneSprite') {
			var depth = stack.pop().replace('16384 + ', ''), // This is automatically added at compilation to push it to the top,
				target = stack.pop(),
				source = stack.pop();
			stack.push('duplicateMovieClip(' + source + ', ' + target + ', ' + depth + ');');
		} else if (act == 'ActionEndDrag') {
			stack.push('stopDrag();');
		} else if (act == 'ActionGetTime') {
			stack.push('getTimer()');
		} else if (act == 'ActionRandomNumber') {
			var max = stack.pop();
			stack.push('random(' + max + ')');
		} else if (act == 'ActionTrace') {
			var a = stack.pop()
			stack.push('trace(' + a + ')');
		
		// Flash 5 //
		} else if (act == 'ActionCallFunction') {
			var functionName = strip(stack.pop()),
				numArgs = stack.pop(),
				args = [];
			while (numArgs--) {
				args.push(stack.pop());
			}
			args = args.join(', ');
			
			stack.push(functionName + '(' + args + ')');
		} else if (act == 'ActionCallMethod') {
			var method = strip(stack.pop()),
				target = stack.pop(),
				numArgs = stack.pop(),
				args = [];
			while (numArgs--) {
				args.push(stack.pop());
			}
			args = args.join(', ');
			
			if (method == '') {
				stack.push(target + '(' + args + ')');
			} else {
				stack.push(target + '.' + method + '(' + args + ')');
			}
		} else if (act == 'ActionConstantPool') {
			//trace2('***ActionConstantPool***', o.constantPool);
			pool = o.constantPool;
		} else if (act == 'ActionDefineFunction') {
			//var object = stack.pop(), 
			var args = [];
			//trace2('ActionDefineFunction : ' + o.numParams, o);
			while (o.numParams--) {
				args.push(o.parameters.pop());
			}
			args.reverse();
			args = args.join(', ');
			
			if (o.functionName) {
				stack.push('function ' + o.functionName + '(' + args + ') {');
				//stack.push('with (' + object + ') {');
			} else {
				stack.push('function(' + args + ') {');
			}
			branches.push(o.pos + o.codeSize);
		} else if (act == 'ActionDefineLocal') {
			// defines a local variable and sets its value
		} else if (act == 'ActionDefineLocal2') {
			// defines a local variable and sets its value
		} else if (act == 'ActionDelete') {
			stack.pop(); // name of prop
			stack.pop(); // object to delete
		} else if (act == 'ActionDelete2') {
			stack.pop(); // name of prop
		} else if (act == 'ActionEnumerate') {
			// Used for .. in
		} else if (act == 'ActionGetMember') {
			var prop = strip(stack.pop());
			var target = stack.pop();
			stack.push(target + '.' + prop);
			//trace2('ActionGetMember : ' + target + '.' + prop);
		} else if (act == 'ActionInitArray') {
			var numArgs = stack.pop(),
				args = [];
			while (numArgs--) {
				args.push(stack.pop());
			}
			args = args.join(', ');
			stack.push('[' + args + ']');
		} else if (act == 'ActionInitObject') {
			var numArgs = stack.pop(),
				args = [];
			while (numArgs--) {
				var val = stack.pop(), name = stack.pop();
				args.push(name + ':' + val);
			}
			args = args.join(', ');
			stack.push('{' + args + '}');
		} else if (act == 'ActionNewMethod') {
			var method = strip(stack.pop()),
				target = stack.pop(),
				numArgs = stack.pop(),
				args = [];
			while (numArgs--) {
				args.push(stack.pop());
			}
			args = args.join(', ');
			
			if (method == '') {
				stack.push('new ' + target + '(' + args + ')');
			} else {
				stack.push('new ' + target + '.' + method + '(' + args + ')');
			}
		} else if (act == 'ActionNewObject') {
			var name = strip(stack.pop()),
				numArgs = stack.pop(),
				args = [];
			while (numArgs--) {
				args.push(stack.pop());
			}
			args = args.join(', ');
			stack.push('new ' + name + '(' + args + ')');
		} else if (act == 'ActionSetMember') {
			var value = stack.pop(),
				prop = strip(stack.pop()),
				target = stack.pop();
			stack.push(target + '.' + prop + ' = ' + value + ';');
		} else if (act == 'ActionTargetPath') {
			// pop object, push target path?
		} else if (act == 'ActionWith') {
			var object = stack.pop();
			stack.push('with (' + object + ') {');
			branches.push(o.pos + o.size);
		} else if (act == 'ActionToNumber') {
			var a = stack.pop();
			stack.push('Number(' + a + ')');
		} else if (act == 'ActionToString') {
			var a = stack.pop();
			stack.push('String(' + a + ')');
		} else if (act == 'ActionTypeOf') {
			var a = stack.pop();
			stack.push('typeof ' + a);
		} else if (act == 'ActionLess2') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' <= ' + a);
		} else if (act == 'ActionModulo') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' % ' + a);
		} else if (act == 'ActionBitAnd') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' & ' + a);
		} else if (act == 'ActionBitLShift') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' << ' + a);
		} else if (act == 'ActionBitOr') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' | ' + a);
		} else if (act == 'ActionBitRShift') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' >> ' + a);
		} else if (act == 'ActionBitURShift') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' >>> ' + a);
		} else if (act == 'ActionBitXor') {
			var a = stack.pop(), b = stack.pop();
			stack.push(b + ' ^ ' + a);
		} else if (act == 'ActionDecrement') {
			var a = stack.pop();
			stack.push(a + '--');
		} else if (act == 'ActionIncrement') {
			var a = stack.pop();
			stack.push(a + '++');
		} else if (act == 'ActionPushDuplicate') {
			var a = stack[stack.length - 1];
			stack.push(a);
		} else if (act == 'ActionReturn') {
			stack.pop();
		} else if (act == 'ActionStackSwap') {
			var a = stack.pop(), b = stack.pop();
			stack.push(a,b);
		} else if (act == 'ActionStoreRegister') {
			//trace2('ActionStoreRegister : ' + o.registerNumber, stack[stack.length - 1]);
			register[o.registerNumber] = stack[stack.length - 1];
		}
		
		// End If
		/*if (branches.length && o.pos > branches[branches.length - 1]) {
			while (o.pos > branches[branches.length - 1]) {
				stack.push('}');
				branches.pop();
			}
		}*/
	}
	
	return stack;//.join('\n\r');
}

// Type 13
function readDefineFontInfo(obj, tag, ba, hasLang) {
	var id = ba.readUI16(),
		font = obj.dictionary[id];
	font.info.name = ba.readString(ba.readUI8());
	ba.readUB(2); // Reserved
	font.info.isSmallText = ba.readBool();
	font.info.isShiftJIS = ba.readBool();
	font.info.isANSI = ba.readBool();
	font.info.isItalics = ba.readBool();
	font.info.isBold = ba.readBool();
	font.info.isWideCodes = ba.readBool();
	if (hasLang) font.info.languageCode = ba.readLANGCODE(); // SWF 5 or earlier: always 0 SWF 6 or later: language code
	
	var i = font.numGlyphs;
	while(i--) { font.info.codeTable.push(font.info.isWideCodes ? ba.readUI16() : ba.readUI8()); }
};

// Type 14
/*
The DefineSound tag defines an event sound. It includes the audio coding format, sampling
rate, size of each sample (8 or 16 bit), a stereo/mono flag, and an array of audio samples. Note
that not all of these parameters will be honored depending on the audio coding format.

The minimum file format version is SWF 1.
*/
function readDefineSound(obj, tag, ba) {
	var snd = {};
	snd.type = 'Sound';
	snd.id = ba.readUI16();
	snd.tag = 'defineSound';
	snd.soundFormat = ba.readUB(4);
	snd.soundRate = ba.readUB(2);
	
	// Size of each sample. This parameter only pertains to uncompressed formats.
	snd.soundSize = ba.readUB(1);
	snd.soundType = ba.readUB(1);
	
	// Number of samples. Not affected by mono/stereo setting; for stereo sounds this is the number of sample pairs.
	snd.soundSampleCount = ba.readUI32();
	
	// Need to create WAV wrapper since this is raw data //
	// uncompressed samples / ADPCM samples
	if (snd.soundFormat == 0 || snd.soundFormat == 3 || snd.soundFormat == 1) {
		snd.data = Flashbug.WAVUtil(snd, ba.readBytes(tag.contentLength - 7));
	}
	
	// Parse MP3 sound data record
	if (snd.soundFormat == 2) {
		ba.readSI16(); // numSamples
		// Read all samples into data
		snd.data = ba.readBytes(tag.contentLength - 9);
	}
	
	// Parse NellyMoser sound data record
	if (snd.soundFormat == 4) snd.data = ba.readBytes(tag.contentLength - 7);
	if (snd.soundFormat == 5) snd.data = ba.readBytes(tag.contentLength - 7);
	if (snd.soundFormat == 6) snd.data = ba.readBytes(tag.contentLength - 7);
	
	// Parse Speex sound data record
	if (snd.soundFormat == 11) snd.data = ba.readBytes(tag.contentLength - 7);
	
	store(obj, snd);
	
	if(typeof obj.sounds == "undefined") obj.sounds = [];
	obj.sounds.push(snd);
}

// Type 18
/*
If a timeline contains streaming sound data, there must be a SoundStreamHead or
SoundStreamHead2 tag before the first sound data block. The SoundStreamHead tag 
defines the data format of the sound data, the recommended playback format, and 
the average number of samples per SoundStreamBlock.

The minimum file format version is SWF 1.
*/
function readSoundStreamHead(obj, tag, ba) {
	var snd = {};
	ba.readUB(4); // Reserved
	snd.type = 'StreamSound';
	snd.tag = 'soundStreamHead';
	snd.id = '-';
	snd.streamID = soundStreamID++;
	snd.playbackSoundRate = ba.readUB(2); // 0 = 5.5 kHz, 1 = 11 kHz, 2 = 22 kHz, 3 = 44 kHz
	snd.playbackSoundSize = ba.readUB(1); // Always 1 (16 bit).
	snd.playbackSoundType = ba.readUB(1); // 0 = sndMono, 1 = sndStereo
	snd.streamSoundCompression = ba.readUB(4); // 1 = ADPCM, SWF 4 and later only: 2 = MP3
	snd.streamSoundRate = ba.readUB(2); // 0 = 5.5 kHz, 1 = 11 kHz, 2 = 22 kHz, 3 = 44 kHz
	snd.streamSoundSize = ba.readUB(1); // Always 1 (16 bit).
	snd.streamSoundType = ba.readUB(1); // 0 = sndMono, 1 = sndStereo
	snd.streamSoundSampleCount = ba.readUI16();
	snd.numSamples = 0;
	snd.numFrames = 0;
	if (snd.streamSoundCompression == SoundCompression.MP3) snd.latencySeek = ba.readSI16();
	snd.rawData = snd.data = '';
	
	if(typeof obj.sounds == "undefined") obj.sounds = [];
	obj.sounds.push(snd);
	obj.streams.push(obj.sounds.length - 1);
	
	return snd;
}

// Type 19
/*
The SoundStreamBlock tag defines sound data that is interleaved with frame data so that
sounds can be played as the SWF file is streamed over a network connection. The
SoundStreamBlock tag must be preceded by a SoundStreamHead or SoundStreamHead2 tag.
There may only be one SoundStreamBlock tag per SWF frame.

The minimum file format version is SWF 1.

The contents of StreamSoundData vary depending on the value of the
StreamSoundCompression field in the SoundStreamHead tag:
■ If StreamSoundCompression is 0 or 3, StreamSoundData contains raw, uncompressed samples.
■ If StreamSoundCompression is 1, StreamSoundData contains an ADPCM sound data record.
■ If StreamSoundCompression is 2, StreamSoundData contains an MP3 sound data record.
■ If StreamSoundCompression is 4, 5, 6, StreamSoundData contains a NELLYMOSERDATA record.
■ If StreamSoundCompression is 11, StreamSoundData contains a Speex record. 
	Speex 1.2 beta 3 is compiled into the Flash Player as of version 10 (10.0.12)

MP3STREAMSOUNDDATA
SampleCount (UI16) Number of samples represented by this block. Not affected by mono/stereo
	setting; for stereo sounds this is the number of sample pairs.
Mp3SoundData (MP3SOUNDDATA) MP3 frames with SeekSamples values.
*/
function readSoundStreamBlock(obj, tag, ba) {
	// If there is more than one sound playing on a given frame, they are combined.
	hasSoundBlock = true;
	
	// Get last stream
	var i = obj.streams[obj.streams.length - 1];
	
	// If found, append stream block
	if(i != null) {
		var streamSoundCompression = obj.sounds[i].streamSoundCompression;
		// uncompressed samples / ADPCM samples
		if (streamSoundCompression == 0 || streamSoundCompression == 3 || streamSoundCompression == 1) {
			obj.sounds[i].rawData += ba.readBytes(tag.contentLength);
			obj.sounds[i].data = Flashbug.WAVUtil(obj.sounds[i], obj.sounds[i].rawData);
		}
		
		// Parse MP3 sound data record
		if (streamSoundCompression == 2) {
			var numSamples = ba.readUI16();
			var seekSamples = ba.readSI16();
			if(numSamples > 0) {
				obj.sounds[i].numSamples += numSamples;
				obj.sounds[i].data += ba.readBytes(tag.contentLength - 4);
			}
			obj.sounds[i].numFrames++;
		}
		// Parse NellyMoser sound data record
		if (streamSoundCompression == 4) obj.sounds[i].data += ba.readBytes(tag.contentLength);
		if (streamSoundCompression == 5) obj.sounds[i].data += ba.readBytes(tag.contentLength);
		if (streamSoundCompression == 6) obj.sounds[i].data += ba.readBytes(tag.contentLength);
		// Parse Speex sound data record
		if (streamSoundCompression == 11) obj.sounds[i].data += ba.readBytes(tag.contentLength);
	} else {
		dump('readSoundStreamBlockTag - unable to find streamhead\n');
	}
}

// Type 20
/*
Defines a lossless bitmap character that contains RGB bitmap data compressed with ZLIB.
The data format used by the ZLIB library is described by Request for Comments (RFCs)
documents 1950 to 1952.

Two kinds of bitmaps are supported. Colormapped images define a colormap of up to 256
colors, each represented by a 24-bit RGB value, and then use 8-bit pixel values to index into
the colormap. Direct images store actual pixel color values using 15 bits (32,768 colors) or 24
bits (about 17 million colors).

The minimum file format version for this tag is SWF 2.
*/
function readDefineBitsLossless(obj, tag, ba, withAlpha) {
	//var pos = ba.position;
	var img = {};
	img.type = 'Image';
	img.id = ba.readUI16();
	img.format = ba.readUI8();
	img.width = ba.readUI16();
	img.height = ba.readUI16();
	img.withAlpha = withAlpha;
	img.imageType = img.format != BitmapFormat.BIT_8 ? "PNG" : "GIF89a";
	img.tag = withAlpha ? 'defineBitsLossless2' : 'defineBitsLossless';
	
	if (img.format == BitmapFormat.BIT_8) img.colorTableSize = ba.readUI8() + 1;
	
	var zlibBitmapData = ba.readBytes(tag.contentLength - ((img.format == 3) ? 8 : 7));
	//var zlibBitmapData = ba.readBytes(tag.contentLength - (ba.position - pos));
	//img.colorData = (new Flashbug.ByteArrayString(zlibBitmapData)).unzip(true);
	img.colorData = new Flashbug.ZipUtil(new Flashbug.ByteArrayString(zlibBitmapData)).unzip(true);
	img.size = img.colorData.length;
	
	store(obj, img);
	
	if (typeof obj.images == "undefined") obj.images = [];
	obj.images.push(img);
};

// Type 21
/*
This tag defines a bitmap character with JPEG compression. It differs from DefineBits in that
it contains both the JPEG encoding table and the JPEG image data. This tag allows multiple
JPEG images with differing encoding tables to be defined within a single SWF file.
The data in this tag begins with the JPEG SOI marker 0xFF, 0xD8 and ends with the EOI
marker 0xFF, 0xD9. Before version 8 of the SWF file format, SWF files could contain an
erroneous header of 0xFF, 0xD9, 0xFF, 0xD8 before the JPEG SOI marker.

In addition to specifying JPEG data, DefineBitsJPEG2 can also contain PNG image data and
non-animated GIF89a image data.

■ If ImageData begins with the eight bytes 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A, the
ImageData contains PNG data.

■ If ImageData begins with the six bytes 0x47 0x49 0x46 0x38 0x39 0x61, the ImageData
contains GIF89a data.

The minimum file format version for this tag is SWF 2. The minimum file format version for
embedding PNG of GIF89a data is SWF 8.
*/
function readDefineBitsJPEG2(obj, tag, ba) {
	var img = readDefineBits(obj, tag, ba);
	img.tag = 'defineBitsJPEG2';
};

// Type 22
function readDefineShape2(obj, tag, ba) {
	var shp = readDefineShape(obj, tag, ba);
	shp.tag = 'defineShape2';
};

// Type 24
/*
The Protect tag marks a file as not importable for editing in an authoring environment. If the
Protect tag contains no data (tag length = 0), the SWF file cannot be imported. If this tag is
present in the file, any authoring tool should prevent the file from loading for editing.
If the Protect tag does contain data (tag length is not 0), the SWF file can be imported if the
correct password is specified. The data in the tag is a null-terminated string that specifies an
MD5-encrypted password. Specifying a password is only supported in SWF 5 or later.
The MD5 password encryption algorithm used was written by Poul-Henning Kamp and is
freely distributable. It resides in the FreeBSD tree at src/lib/libcrypt/crypt-md5.c. The
EnableDebugger tag also uses MD5 password encryption algorithm.

The minimum file format version is SWF 2.
*/
function readProtect(obj, tag, ba) {
	obj.isProtected = true;
	if (tag.contentLength > 0) obj.password = ba.readBytes(tag.contentLength);
};

// Type 26
function readPlaceObject2(obj, tag, ba) {
	obj.stage = obj.stage || [];
	var o = {
		frame: obj.frameIndex,
		hasClipActions: ba.readBoolean(),
		hasClipDepth: ba.readBoolean(),
		hasName: ba.readBoolean(),
		hasRatio: ba.readBoolean(),
		hasColorTransform: ba.readBoolean(),
		hasMatrix: ba.readBoolean(),
		hasCharacter: ba.readBoolean(),
		move: ba.readBoolean(),
		depth: ba.readUI16()
	};
	if (o.hasCharacter) o.id = ba.readUI16();
	if (o.hasMatrix) o.matrix = ba.readMatrix();
	if (o.hasColorTransform) o.colorTransform = ba.readCXFormWithAlpha();
	if (o.hasRatio) o.ratio = ba.readUI16();
	if (o.hasName) o.name = ba.readString();
	if (o.hasClipDepth) o.clipDepth = ba.readUI16();
	if (o.hasClipActions) o.clipActions = readClipActions(obj, tag, ba);
	
	obj.stage.push(o);
}

function readClipActions(obj, tag, ba) {
	ba.readUI16(); // Reserved, must be 0
	var o = {
		allEventFlags: readClipEventFlags(obj, tag, ba),
		clipActionRecords: []
	}
	
	// ClipActionEndFlag, must be 0
	while(obj.version <= 5 ? (ba.readUI16() != 0) : (ba.readUI32() != 0)) {
		ba.position -= (obj.version <= 5) ? 2 : 4;
		o.clipActionRecords.push(readClipActionRecord(obj, tag, ba));
	}
	
	return o;
}

function readClipActionRecord(obj, tag, ba) {
	var o = {
		eventFlags: readClipEventFlags(obj, tag, ba),
		actionRecordSize: ba.readUI32(),
		actions: []
	},
		endPos = ba.position + o.actionRecordSize;
	if (o.eventFlags.clipEventKeyPress) o.keyCode = ba.readUI8();
	
	while (ba.position < endPos) {
		var code = ba.readUI8();
		o.actions.push(readActionRecord(code, ba));
	}
	return o;
};	

function readClipEventFlags(obj, tag, ba) {
	var o = {
		clipEventKeyUp: ba.readBoolean(),
		clipEventKeyDown: ba.readBoolean(),
		clipEventMouseUp: ba.readBoolean(),
		clipEventMouseDown: ba.readBoolean(),
		clipEventMouseMove: ba.readBoolean(),
		clipEventUnload: ba.readBoolean(),
		clipEventEnterFrame: ba.readBoolean(),
		clipEventLoad: ba.readBoolean(),
		clipEventDragOver: ba.readBoolean(),
		clipEventRollOut: ba.readBoolean(),
		clipEventRollOver: ba.readBoolean(),
		clipEventReleaseOutside: ba.readBoolean(),
		clipEventRelease: ba.readBoolean(),
		clipEventPress: ba.readBoolean(),
		clipEventInitialize: ba.readBoolean(),
		clipEventData: ba.readBoolean()
	};
	
	if (obj.version >= 6) {
		ba.readUB(5); // Reserved, always 0
		o.clipEventConstruct =  ba.readBoolean();
		o.clipEventKeyPress =  ba.readBoolean();
		o.clipEventDragOut =  ba.readBoolean();
		ba.readUB(8); // Reserved, always 0
	};
	
	return o;
}

// Type 32
function readDefineShape3(obj, tag, ba) {
	readDefineShape(obj, tag, ba, true);
}

// Type 33
function readDefineText2(obj, tag, ba) {
	readDefineText(obj, tag, ba, true);
};

// Type 35
/*
This tag defines a bitmap character with JPEG compression. This tag extends
DefineBitsJPEG2, adding alpha channel (opacity) data. Opacity/transparency information is
not a standard feature in JPEG images, so the alpha channel information is encoded separately
from the JPEG data, and compressed using the ZLIB standard for compression. The data
format used by the ZLIB library is described by Request for Comments (RFCs) documents
1950 to 1952.

The data in this tag begins with the JPEG SOI marker 0xFF, 0xD8 and ends with the EOI
marker 0xFF, 0xD9. Before version 8 of the SWF file format, SWF files could contain an
erroneous header of 0xFF, 0xD9, 0xFF, 0xD8 before the JPEG SOI marker.
In addition to specifying JPEG data, DefineBitsJPEG2 can also contain PNG image data and
non-animated GIF89a image data.

■ If ImageData begins with the eight bytes 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A, the
ImageData contains PNG data.

■ If ImageData begins with the six bytes 0x47 0x49 0x46 0x38 0x39 0x61, the ImageData
contains GIF89a data.

If ImageData contains PNG or GIF89a data, the optional BitmapAlphaData is not
supported.

The minimum file format version for this tag is SWF 3. The minimum file format version for
embedding PNG of GIF89a data is SWF 8.
*/
function readDefineBitsJPEG3(obj, tag, ba) {
	readDefineBits(obj, tag, ba, true);
};

// Type 36
/*
DefineBitsLossless2 extends DefineBitsLossless with support for opacity (alpha values). The
colormap colors in colormapped images are defined using RGBA values, and direct images
store 32-bit ARGB colors for each pixel. The intermediate 15-bit color depth is not available
in DefineBitsLossless2.

The minimum file format version for this tag is SWF 3.

// ZlibBitmapData If BitmapFormat = 3, ALPHACOLORMAPDATA 
// If BitmapFormat = 4 or 5, ALPHABITMAPDATA
*/
function readDefineBitsLossless2(obj, tag, ba) {
	readDefineBitsLossless(obj, tag, ba, true);
}

// Type 37
function readDefineEditText(obj, tag, ba) {
	var id = ba.readUI16(),
		txt = {
			type: 'Text',
			id: id,
			tag: 'defineEditText',
			bounds: ba.readRect(),
			hasText: ba.readBool(),
			isWordWrap: ba.readBool(),
			isMultiline: ba.readBool(),
			isPassword: ba.readBool(),
			isReadOnly: ba.readBool(),
			hasTextColor: ba.readBool(),
			hasMaxLength: ba.readBool(),
			hasFont: ba.readBool(),
			hasFontClass: ba.readBool(),
			isAutoSize: ba.readBool(),
			hasLayout: ba.readBool(),
			isNoSelect: ba.readBool(),
			hasBorder: ba.readBool(),
			wasStatic: ba.readBool(),
			isHTML: ba.readBool(),
			useOutlines: ba.readBool()
		};
		
	txt.bounds.left /= 20;
	txt.bounds.right /= 20;
	txt.bounds.top /= 20;
	txt.bounds.bottom /= 20;
		
	if (txt.hasFont) txt.fontID = ba.readUI16();
	if (txt.hasFontClass) txt.fontClass = ba.readString();
	if (txt.hasFont) txt.fontHeight = ba.readUI16();
	if (txt.hasTextColor) txt.textColor = ba.readRGBA();
	if (txt.hasMaxLength) txt.maxLength = ba.readUI16();
	if (txt.hasLayout) {
		txt.align = ba.readUI8();
		txt.leftMargin = ba.readUI16() / 20 /* twips */;
		txt.rightMargin = ba.readUI16() / 20 /* twips */;
		txt.indent = ba.readUI16() / 20 /* twips */;
		txt.leading = ba.readSI16() / 20 /* twips */;
	}
	txt.variableName = ba.readString();
	if (txt.hasText) txt.initialText = ba.readString();
	
	store(obj, txt);
	
	if (typeof obj.text == "undefined") obj.text = [];
	obj.text.push(txt);
}

// Type 39
function readDefineSprite(obj, tag, ba) {
	var spr = {};
	spr.type = 'Sprite';
	spr.id = ba.readUI16();
	spr.dictionary = [];// obj.dictionary;
	spr.frames = [];
	spr.version = obj.version;
	spr.frameIndex = 1;
	spr.frameCount = ba.readUI16();
	
	spr.streams = [];
	spr.stage = [new Frame()];
	spr.frameRate = obj.frameRate;
	
	// Control tags
	readTags(spr, ba);
	
	store(obj, spr);
}

// Type 40 - Undocumented
function readNameCharacter(obj, tag, ba) {
	if (typeof obj.nameCharacter == "undefined") obj.nameCharacter = [];
	obj.nameCharacter.push(ba.readBytes(tag.contentLength));
};

// Type 41 - Undocumented
const PRODUCTS = [
	"unknown", // 0
	"Macromedia Flex for J2EE",
	"Macromedia Flex for .NET",    
	"Adobe Flex",
];
const EDITIONS = [
	"Developer Edition", // 0       
	"Full Commercial Edition", // 1 
	"Non-Commercial Edition", // 2
	"Educational Edition", // 3
	"NFR Edition", // 4
	"Trial Edition", // 5
	""      // 6 no edition
];
function readProductInfo(obj, tag, ba) {
	obj.productInfo = {};
	obj.productInfo.product = PRODUCTS[ba.readUI32()];
	obj.productInfo.edition = EDITIONS[ba.readUI32()];
	obj.productInfo.majorVersion = ba.readUI8();
	obj.productInfo.minorVersion = ba.readUI8();
	obj.productInfo.build = ba.readUI64();
	obj.productInfo.compileDate = new Date(ba.readUI64()).toLocaleString();
	obj.productInfo.sdk = obj.productInfo.majorVersion + '.' + obj.productInfo.minorVersion + '.' + obj.productInfo.build;
}

// Type 43
function readFrameLabel(obj, tag, ba) {
	obj.frames = obj.frames || [];
	
	var lbl = ba.readString();
	if (obj.frames[obj.frameIndex]) {
		if (obj.frames[obj.frameIndex].length) {
			// Multiple
			obj.frames[obj.frameIndex][obj.frames[obj.frameIndex].length - 1].label = lbl;
		} else {
			// Single
			obj.frames[obj.frameIndex].label = lbl;
		}
	} else {
		// Empty
		obj.frames[obj.frameIndex] = { type:'ActionScript', frame:obj.frameIndex, label:lbl, actionscript:''};
	}
}

// Type 45
/*
The SoundStreamHead2 tag is identical to the SoundStreamHead tag, except it allows
different values for StreamSoundCompression and StreamSoundSize (SWF 3 file format).
*/
function readSoundStreamHead2(obj, tag, ba) {
	var snd = readSoundStreamHead(obj, tag, ba);
	snd.tag = 'soundStreamHead2';
}

// Type 46
function readDefineMorphShape(obj, tag, ba, withLineV2) {
	var id = ba.readUI16(),
		t = this,
		startBounds = ba.readRect(),
		endBounds = ba.readRect();
		
	if (withLineV2) {
		var startEdgeBounds = ba.readRect(),
			endEdgeBounds = ba.readRect();
			
		startEdgeBounds.left /= 20; /* twips */
		startEdgeBounds.right /= 20; /* twips */
		startEdgeBounds.top /= 20; /* twips */
		startEdgeBounds.bottom /= 20; /* twips */
		
		endEdgeBounds.left /= 20; /* twips */
		endEdgeBounds.right /= 20; /* twips */
		endEdgeBounds.top /= 20; /* twips */
		endEdgeBounds.bottom /= 20; /* twips */
			
		ba.readUB(6); // Reserved
		
		var usesNonScalingStrokes = ba.readBool(),
			usesScalingStrokes = ba.readBool();
		ba.align();
	}
	
	startBounds.left /= 20; /* twips */
	startBounds.right /= 20; /* twips */
	startBounds.top /= 20; /* twips */
	startBounds.bottom /= 20; /* twips */
	
	endBounds.left /= 20; /* twips */
	endBounds.right /= 20; /* twips */
	endBounds.top /= 20; /* twips */
	endBounds.bottom /= 20; /* twips */
	
	var endEdgesOffset = ba.readUI32(),
		fillStyles = readFillStyleArray(ba, true, true, obj),
		lineStyles = readLineStyleArray(ba, true, withLineV2, true, obj),
		morph = {
			type: "Morph",
			id: id,
			fillStyles: fillStyles,
			lineStyles: lineStyles,
			start: {
				type: "Morph",
				id: id,
				bounds: startBounds,
				edges: readEdges(ba, fillStyles, lineStyles, true, withLineV2, true, obj)
			},
			end: {
				type: "Morph",
				id: id,
				bounds: endBounds,
				edges: readEdges(ba, fillStyles, lineStyles, true, withLineV2, true, obj)
			}
		};
		
	if (withLineV2) {
		morph.start.edgeBounds = startEdgeBounds;
		morph.end.edgeBounds = endEdgeBounds;
		morph.usesNonScalingStrokes = usesNonScalingStrokes;
		morph.usesScalingStrokes = usesScalingStrokes;
	}
		
	morph.tag = withLineV2 ? 'defineMorphShape2' : 'defineMorphShape';
	
	morph2SVG(morph);
	
	store(obj, morph);
	
	if(typeof obj.morph_shapes == "undefined") obj.morph_shapes = [];
	obj.morph_shapes.push(morph);
}

// Type 48
/*
The DefineFont2 tag extends the functionality of DefineFont. Enhancements include
the following:
■ 32-bit entries in the OffsetTable, for fonts with more than 64K glyphs.
■ Mapping to device fonts, by incorporating all the functionality of DefineFontInfo.
■ Font metrics for improved layout of dynamic glyph text.
DefineFont2 tags are the only font definitions that can be used for dynamic text.

The minimum file format version is SWF 3.
*/
function readDefineFont2(obj, tag, ba, isHiRes) {
	var font = {};
	font.type = 'Font';
	font.id = ba.readUI16();
	font.tag = isHiRes ? 'defineFont3' : 'defineFont2';
	font.hasLayout = ba.readBool();
	font.info = {};
	font.info.isShiftJIS = ba.readBool();
	font.info.isSmallText = ba.readBool();
	font.info.isANSI = ba.readBool();
	font.info.useWideOffsets = ba.readBool();
	font.info.isWideCodes = ba.readBool();
	font.info.isItalics = ba.readBool();
	font.info.isBold = ba.readBool();
	font.info.languageCode = ba.readLANGCODE(); // SWF 5 or earlier: always 0 SWF 6 or later: language code
	font.info.nameLen = ba.readUI8();
	font.info.name = ba.readString(font.info.nameLen);
	font.numGlyphs = ba.readUI16();
	if (font.numGlyphs > 0) font.info.codeTable = [];
	if (font.numGlyphs > 0) font.glyphShapeTable = [];
	if (font.numGlyphs > 0) font.offsetTable = [];
	font.dataSize = tag.contentLength;
	
	var i = font.numGlyphs,
		tablesOffset = ba.position;
	
	if (font.numGlyphs > 0)  {
		while (i--) { font.offsetTable.push(font.info.useWideOffsets ? ba.readUI32() : ba.readUI16()); }
	}
	
	if (!isHiRes || (isHiRes && font.numGlyphs > 0)) font.codeTableOffset = font.info.useWideOffsets ? ba.readUI32() : ba.readUI16();
		
	if (font.numGlyphs > 0)  {	
		for(var i = 0, o = font.offsetTable[0]; o; o = font.offsetTable[++i]) {
			ba.seek(tablesOffset + o, true);
			font.glyphShapeTable.push(readGlyph(ba, isHiRes));
		}
		
		i = font.numGlyphs;
		while (i--) { font.info.codeTable.push(font.info.isWideCodes ? ba.readUI16() : ba.readUI8()); };
	}
	
	if(font.hasLayout) font.ascent = ba.readSI16() / (isHiRes ? 20 : 1);
	if(font.hasLayout) font.descent = ba.readSI16() / (isHiRes ? 20 : 1);
	if(font.hasLayout) font.leading = ba.readSI16() / (isHiRes ? 20 : 1);
	if(font.hasLayout && font.numGlyphs > 0) {
		i = font.numGlyphs;
		font.advanceTable = [];
		while (i--) { font.advanceTable.push(ba.readSI16() / (isHiRes ? 20 : 1)); };
	}
	if(font.hasLayout && font.numGlyphs > 0) {
		i = font.numGlyphs;
		font.boundsTable = [];
		while (i--) {
			var rect = ba.readRect();
			rect.left /= isHiRes ? 20 : 1;
			rect.right /= isHiRes ? 20 : 1;
			rect.top /= isHiRes ? 20 : 1;
			rect.bottom /= isHiRes ? 20 : 1;
			font.boundsTable.push(rect);
		};
	}
	if(font.hasLayout) font.kerningCount = ba.readUI16(); // Not used in Flash Player through version 7 (always set to 0 to save space).
	if(font.hasLayout) {
		i = font.kerningCount;
		font.kerningTable = [];
		// KerningRecord
		while (i--) { 
			var kerningRecord = {
				fontKerningCode1: font.info.isWideCodes ? ba.readUI16() : ba.readUI8(),
				fontKerningCode2: font.info.isWideCodes ? ba.readUI16() : ba.readUI8(),
				fontKerningAdjustment: ba.readSI16() / (isHiRes ? 20 : 1)
			};
			font.kerningTable.push(kerningRecord);
		};
	}
	
	store(obj, font);
	
	obj.fonts = obj.fonts || [];
	obj.fonts.push(font);
	
	return font;
};

// Type 49 - Undocumented
function readGeneratorCommand(obj, tag, ba) {
	var cmd = {};
	cmd.version = ba.readUI32();
	cmd.info = ba.readString();
	
	obj.genCommands = obj.genCommands || [];
	obj.genCommands.push(cmd);
};

// Type 51 - Undocumented
function readCharacterSet(obj, tag, ba) {
	if (typeof obj.charSet == "undefined") obj.charSet = [];
	obj.charSet.push(ba.readBytes(tag.contentLength));
};

// Type 56
function readExportAssets(obj, tag, ba) {
	var numSymbols = ba.readUI16();
	while(numSymbols--) {
		var tag2 = {id:ba.readUI16(), exportName:ba.readString()};
		store(obj, tag2);
	}
};

// Type 57
function readImportAssets(obj, tag, ba, isV2) {
	var url = ba.readString();
	
	if (isV2) {
		ba.readUI8(); // Reserved, 1
		ba.readUI8(); // Reserved, 0
	}
	
	var count = ba.readUI16();
	while(count--) {
		var tag2 = {id:ba.readUI16(), exportName:ba.readString(), url:url};
		store(obj, tag2);
	}
}

// Type 58
function readEnableDebugger(obj, tag, ba, isV2) {
	obj.isDebugger = true;
	if (isV2) ba.readUI16(); // Reserved
	if (tag.contentLength > 0) obj.debugPassword = ba.readString((tag.contentLength - (isV2 ? 2 : 0)), true);
};

// Type 59
function readDoInitAction(obj, tag, ba) {
	// spriteID actions
	var spr = obj.dictionary[ba.readUI16()];
	
	var actionsRaw = [], code;
	while ((code = ba.readUI8())) { // Action Code or ActionEndFlag
		actionsRaw.push(readActionRecord(code, ba));
	}
	
	var as = actionsRaw.length ? convertActions(actionsRaw) : [];
	spr.initAction = {type:'ActionScript', actions:actionsRaw, actionscript:as};
};

function readActionRecord(code, ba) {
	var o = { code:'0x' + code.toString(16) }, prePos = ba.position - 4;
	if (code >= 0x80) var actionLength = ba.readUI16();
	
	// SWF 1 & 2 Actions //
	
	// no arguments
	if (code == 0x00) {
		o.action = 'ActionNone';
	} else
	
	// no arguments
	if (code == 0x80) {
		o.action = 'ActionHasLength';
	} else
	
	// frame num (int)
	if (code == 0x81) {
		o.action = 'ActionGotoFrame';
		o.frame = ba.readUI16() + 1;
	} else
	
	// url (STR), window (STR)
	if (code == 0x83) {
		o.action = 'ActionGetURL';
		o.urlString = ba.readString();
		o.targetString = ba.readString();
	} else
	
	// no arguments
	if (code == 0x04) {
		o.action = 'ActionNextFrame';
	} else
	
	// no arguments
	if (code == 0x05) {
		o.action = 'ActionPreviousFrame';
	} else
	
	// no arguments
	if (code == 0x06) {
		o.action = 'ActionPlay';
	} else
	
	// no arguments
	if (code == 0x07) {
		o.action = 'ActionStop';
	} else
	
	// no arguments
	if (code == 0x08) {
		o.action = 'ActionToggleQuality';
	} else
	
	// no arguments
	if (code == 0x09) {
		o.action = 'ActionStopSounds';
	} else
	
	// frame needed (int), actions to skip (BYTE)
	if (code == 0x8A) {
		o.action = 'ActionWaitForFrame';
		o.frame = ba.readUI16();
		o.skipCount = ba.readUI8();
	} else
	
	// SWF 3 Actions //
	
	// name (STR)
	if (code == 0x8B) {
		o.action = 'ActionSetTarget';
		o.targetName = ba.readString();
	} else
	
	// name (STR)
	if (code == 0x8C) {
		o.action = 'ActionGoToLabel';
		o.label = ba.readString();
	} else
	
	// SWF 4 Actions //
	
	// Stack IN: number, number, OUT: number
	if (code == 0x0A) {
		o.action = 'ActionAdd';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x0B) {
		o.action = 'ActionSubtract';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x0C) {
		o.action = 'ActionMultiply';
	} else
	
	// Stack IN: dividend, divisor, OUT: number
	if (code == 0x0D) {
		o.action = 'ActionDivide';
	} else
	
	// Stack IN: number, number, OUT: bool
	if (code == 0x0E) {
		o.action = 'ActionEquals';
	} else
	
	// Stack IN: number, number, OUT: bool
	if (code == 0x0F) {
		o.action = 'ActionLess';
	} else
	
	// Stack IN: bool, bool, OUT: bool
	if (code == 0x10) {
		o.action = 'ActionAnd';
	} else
	
	// Stack IN: bool, bool, OUT: bool
	if (code == 0x11) {
		o.action = 'ActionOr';
	} else
	
	// Stack IN: bool, OUT: bool
	if (code == 0x12) {
		o.action = 'ActionNot';
	} else
	
	// Stack IN: string, string, OUT: bool
	if (code == 0x13) {
		o.action = 'ActionStringEquals';
	} else
	
	// Stack IN: string, OUT: number
	if (code == 0x14) {
		o.action = 'ActionStringLength';
	} else
	
	// Stack IN: string, strng, OUT: string
	if (code == 0x21) {
		o.action = 'ActionStringAdd';
	} else
	
	// Stack IN: string, index, count, OUT: substring
	if (code == 0x15) {
		o.action = 'ActionStringExtract';
	} else
	
	// type (BYTE), value (STRING or FLOAT)
	if (code == 0x96) {
		o.action = 'ActionPush';
		o.stack = [];
		var end = ba.position + actionLength;
		do {
			var o2 = {};
			o2.type = ba.readUI8();
			switch(o2.type) {
				case 0 : o2.value = ba.readString(); o2.type = 'string'; break;
				case 1 : o2.value = ba.readFloat(); o2.type = 'float'; break;
				case 2 : /* null */ o2.type = 'null';  break;
				case 3 : /* undefined */ o2.type = 'undefined';  break;
				case 4 : o2.value = ba.readUI8(); o2.type = 'register'; break;
				case 5 : o2.value = ba.readUI8(); o2.type = 'boolean'; break;
				case 6 : o2.value = ba.readDouble(); o2.type = 'double'; break;
				case 7 : o2.value = ba.readUI32(); o2.type = 'integer'; break;
				case 8 : o2.value = ba.readUI8(); o2.type = 'constant'; break; // Constant pool index (for indexes < 256)
				case 9 : o2.value = ba.readUI16(); o2.type = 'constant'; break; // Constant pool index (for indexes >= 256)
			}
			o.stack.push(o2);
		} while (ba.position < end);
	} else
	
	// no arguments
	if (code == 0x17) {
		o.action = 'ActionPop';
	} else
	
	// Stack IN: number, OUT: integer
	if (code == 0x18) {
		o.action = 'ActionToInteger';
	} else
	
	// offset (int)
	if (code == 0x99) {
		o.action = 'ActionJump';
		o.branchOffset = ba.readSI16();
	} else
	
	// offset (int) Stack IN: bool
	if (code == 0x9D) {
		o.action = 'ActionIf';
		o.branchOffset = ba.readSI16();
	} else
	
	// Stack IN: name
	if (code == 0x9E) {
		o.action = 'ActionCall';
	} else
	
	// Stack IN: name, OUT: value
	if (code == 0x1C) {
		o.action = 'ActionGetVariable';
	} else
	
	// Stack IN: name, value
	if (code == 0x1D) {
		o.action = 'ActionSetVariable';
	} else
	
	// method (BYTE) Stack IN: url, window
	if (code == 0x9A) {
		o.action = 'ActionGetURL2';
		/*
		0 = None
		1 = GET
		2 = POST
		*/
		o.sendVarsMethod = ba.readUB(2);
		
		ba.readUB(4); //reserved, always 0
		
		/*
		0 = Target is a browser window
		1 = Target is a path to a sprite
		*/
		o.loadTargetFlag = ba.readUB(1);
		
		/*
		0 = No variables to load
		1 = Load variables
		*/
		o.loadVariablesFlag = ba.readUB(1);
		ba.align();
	} else
	
	// flags (BYTE) Stack IN: frame
	if (code == 0x9F) {
		o.action = 'ActionGotoFrame2';
		ba.readUB(6); // reserved, always 0
		o.sceneBiasFlag = ba.readUB(1);
		o.playFlag = ba.readUB(1);// 0 = Go to frame and stop, 1 = Go to frame and play
		ba.align();
		if (o.sceneBiasFlag == 1) o.sceneBias = ba.readUI16();
	} else
	
	// Stack IN: target
	if (code == 0x20) {
		o.action = 'ActionSetTarget2';
	} else
	
	// Stack IN: target, property, OUT: value
	if (code == 0x22) {
		o.action = 'ActionGetProperty';
	} else
	
	// Stack IN: target, property, value
	if (code == 0x23) {
		o.action = 'ActionSetProperty';
	} else
	
	// Stack IN: source, target, depth
	if (code == 0x24) {
		o.action = 'ActionCloneSprite';
	} else
	
	// Stack IN: target
	if (code == 0x25) {
		o.action = 'ActionRemoveSprite';
	} else
	
	// Stack IN: message
	if (code == 0x26) {
		o.action = 'ActionTrace';
	} else
	
	// Stack IN: no constraint: 0, center, target
	// constraint: x1, y1, x2, y2, 1, center, target
	if (code == 0x27) {
		o.action = 'ActionStartDrag';
	} else
	
	// no arguments
	if (code == 0x28) {
		o.action = 'ActionEndDrag';
	} else
	
	// Stack IN: string, string, OUT: bool
	if (code == 0x29) {
		o.action = 'ActionStringLess';
	} else
	
	// skipCount (BYTE) Stack IN: frame
	if (code == 0x8D) {
		o.action = 'ActionWaitForFrame2';
		o.skipCount = ba.readUI8();
	} else
	
	// Stack IN: maximum, OUT: result
	if (code == 0x30) {
		o.action = 'ActionRandomNumber';
	} else
	
	// Stack IN: string, OUT: length
	if (code == 0x31) {
		o.action = 'ActionMBStringLength';
	} else
	
	// Stack IN: character, OUT: ASCII code
	if (code == 0x32) {
		o.action = 'ActionCharToAscii';
	} else
	
	// Stack IN: ASCII code, OUT: character
	if (code == 0x33) {
		o.action = 'ActionAsciiToChar';
	} else
	
	// Stack OUT: milliseconds since Player start
	if (code == 0x34) {
		o.action = 'ActionGetTime';
	} else
	
	// Stack IN: string, index, count, OUT: substring
	if (code == 0x35) {
		o.action = 'ActionMBStringExtract';
	} else
	
	// Stack IN: character, OUT: ASCII code
	if (code == 0x36) {
		o.action = 'ActionMBCharToAscii';
	} else
	
	// Stack IN: ASCII code, OUT: character
	if (code == 0x37) {
		o.action = 'ActionMBAsciiToChar';
	} else
	
	// SWF 5 Actions //
	
	// Stack IN: name of object to delete
	if (code == 0x3A) {
		o.action = 'ActionDelete';
	} else
	
	// name (STRING), body (BYTES)
	if (code == 0x9B) {
		o.action = 'ActionDefineFunction';
		o.functionName = ba.readString();
		o.numParams = ba.readUI16();
		o.parameters = [];
		for (var i = 0; i < o.numParams; i++) {
			o.parameters.push(ba.readString());
		}
		o.codeSize = ba.readUI16();
	} else
	
	// Stack IN: name
	if (code == 0x3B) {
		o.action = 'ActionDelete2';
	} else
	
	// Stack IN: name, value
	if (code == 0x3C) {
		o.action = 'ActionDefineLocal';
	} else
	
	// Stack IN: function, numargs, arg1, arg2, ... argn
	if (code == 0x3D) {
		o.action = 'ActionCallFunction';
	} else
	
	// Stack IN: value to return
	if (code == 0x3E) {
		o.action = 'ActionReturn';
	} else
	
	// Stack IN: x, y Stack OUT: x % y
	if (code == 0x3F) {
		o.action = 'ActionModulo';
	} else
	
	// like CallFunction but constructs object
	if (code == 0x40) {
		o.action = 'ActionNewObject';
	} else
	
	// Stack IN: name
	if (code == 0x41) {
		o.action = 'ActionDefineLocal2';
	} else
	
	// Stack IN: //# of elems, arg1, arg2, ... argn
	if (code == 0x42) {
		o.action = 'ActionInitArray';
	} else
	
	// Stack IN: //# of elems, arg1, name1, ...
	if (code == 0x43) {
		o.action = 'ActionInitObject';
	} else
	
	// Stack IN: object, Stack OUT: type of object
	if (code == 0x44) {
		o.action = 'ActionTypeOf';
	} else
	
	// Stack IN: object, Stack OUT: target path
	if (code == 0x45) {
		o.action = 'ActionTargetPath';
	} else
	
	// Stack IN: name, Stack OUT: children ended by null
	if (code == 0x46) {
		o.action = 'ActionEnumerate';
	} else
	
	// register number (BYTE, 0-31)
	if (code == 0x87) {
		o.action = 'ActionStoreRegister';
		o.registerNumber = ba.readUI8();
	} else
	
	// Like ActionAdd, but knows about types
	if (code == 0x47) {
		o.action = 'ActionAdd2';
	} else
	
	// Like ActionLess, but knows about types
	if (code == 0x48) {
		o.action = 'ActionLess2';
	} else
	
	// Like ActionEquals, but knows about types
	if (code == 0x49) {
		o.action = 'ActionEquals2';
	} else
	
	// Stack IN: object Stack OUT: number
	if (code == 0x4A) {
		o.action = 'ActionToNumber';
	} else
	
	// Stack IN: object Stack OUT: string
	if (code == 0x4B) {
		o.action = 'ActionToString';
	} else
	
	// pushes duplicate of top of stack
	if (code == 0x4C) {
		o.action = 'ActionPushDuplicate';
	} else
	
	// swaps top two items on stack
	if (code == 0x4D) {
		o.action = 'ActionStackSwap';
	} else
	
	// Stack IN: object, name, Stack OUT: value
	if (code == 0x4E) {
		o.action = 'ActionGetMember';
	} else
	
	// Stack IN: object, name, value
	if (code == 0x4F) {
		o.action = 'ActionSetMember';
	} else
	
	// Stack IN: value, Stack OUT: value+1
	if (code == 0x50) {
		o.action = 'ActionIncrement';
	} else
	
	// Stack IN: value, Stack OUT: value-1
	if (code == 0x51) {
		o.action = 'ActionDecrement';
	} else
	
	// Stack IN: object, name, numargs, arg1, arg2, ... argn
	if (code == 0x52) {
		o.action = 'ActionCallMethod';
	} else
	
	// Like ActionCallMethod but constructs object
	if (code == 0x53) {
		o.action = 'ActionNewMethod';
	} else
	
	// body length: int, Stack IN: object
	if (code == 0x94) { 
		o.action = 'ActionWith';
		o.size = ba.readUI16();
		//o.code = ba.readString(o.size);
	} else
	
	// Attaches constant pool
	if (code == 0x88) {
		o.action = 'ActionConstantPool';
		o.count = ba.readUI16();
		o.constantPool = [];
		while (o.count--) {
			o.constantPool.push(ba.readString());
		}
	} else
	
	// Activate/deactivate strict mode
	if (code == 0x89) {
		o.action = 'ActionStrictMode';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x60) {
		o.action = 'ActionBitAnd';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x61) {
		o.action = 'ActionBitOr';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x62) {
		o.action = 'ActionBitXor';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x63) {
		o.action = 'ActionBitLShift';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x64) {
		o.action = 'ActionBitRShift';
	} else
	
	// Stack IN: number, number, OUT: number
	if (code == 0x65) {
		o.action = 'ActionBitURShift';
	} else
	
	// SWF 6 Actions //
	
	// Stack IN: object, class OUT: boolean
	if (code == 0x54) {
		o.action = 'ActionInstanceOf';
	} else
	
	// Stack IN: object, Stack OUT: children ended by null
	if (code == 0x55) {
		o.action = 'ActionEnumerate2';
	} else
	
	// Stack IN: something, something, OUT: bool
	if (code == 0x66) {
		o.action = 'ActionStrictEquals';
	} else
	
	// Stack IN: something, something, OUT: bool
	if (code == 0x67) {
		o.action = 'ActionGreater';
	} else
	
	// Stack IN: something, something, OUT: bool
	if (code == 0x68) {
		o.action = 'ActionStringGreater';
	} else
	
	// SWF 7 Actions //
	
	// name (STRING), numParams (WORD), registerCount (BYTE)
	if (code == 0x8E) {
		o.action = 'ActionDefineFunction2';
		o.functionName = ba.readString();
		o.numParams = ba.readUI16();
		o.registerCount = ba.readUI8();
		o.preloadParentFlag = ba.readUB(1);
		// 0 = Don't preload _parent into register
		// 1 = Preload _parent into register
		o.preloadRootFlag = ba.readUB(1);
		// 0 = Don't preload _root into register
		// 1 = Preload _root into register
		o.suppressSuperFlag = ba.readUB(1);
		// 0 = Create super variable
		// 1 = Don't create super variable
		o.preloadSuperFlag = ba.readUB(1);
		o.suppressArgumentsFlag = ba.readUB(1);
		o.preloadArgumentsFlag = ba.readUB(1);
		o.suppressThisFlag = ba.readUB(1);
		o.preloadThisFlag = ba.readUB(1);
		ba.readUB(7); //Reserved
		o.preloadGlobalFlag = ba.readUB(1);
		o.parameters = [];
		for (var i = 0; i < o.numParams; i++) {
			// REGISTERPARAM
			o.parameters.push({register:ba.readUI8(), paramName:ba.readString() });
		}
		o.codeSize = ba.readUI16();
	} else
	
	// no arguments
	if (code == 0x8F) {
		o.action = 'ActionTry';
		ba.readUB(5); // Reserved
		o.CatchInRegisterFlag = ba.readUB(1);
		o.FinallyBlockFlag = ba.readUB(1);
		o.CatchBlockFlag = ba.readUB(1);
		ba.align();
		o.TrySize = ba.readUI16();
		o.CatchSize = ba.readUI16();
		o.FinallySize = ba.readUI16();
		if (o.CatchInRegisterFlag == 0) {
			o.CatchName = ba.readString();
		} else if (o.CatchInRegisterFlag == 1) {
			o.CatchRegister = ba.readUI8();
		}
		o.TryBody = ba.readString(o.TrySize); // says ba.readUI8(size) ???
		o.CatchBody = ba.readString(o.CatchSize);
		o.FinallyBody = ba.readString(o.FinallySize);
	} else
	
	// no arguments
	if (code == 0x2A) {
		o.action = 'ActionThrow';
	} else
	
	// no arguments
	if (code == 0x2B) {
		o.action = 'ActionCastOp';
	} else
	
	// no arguments
	if (code == 0x2C) {
		o.action = 'ActionImplementsOp';
	} else
		
	// stack in: baseclass, classname, constructor
	if (code == 0x69) {
		o.action = 'ActionExtends';
	} else
	
	// Misc Actions //
	
	// nop
	if (code == 0x77) {
		o.action = 'ActionNOP';
	} else
	
	// halt script execution
	if (code == 0x5F) {
		o.action = 'ActionHalt';
	} else
	
	// I think this is what they are using...
	if (code == 0xAA) {
		o.action = 'ActionQuickTime';
	} else
	
	// Unknown actioncode
	{
		o.action = '???';
	}
	
	o.pos = prePos;
	if (code >= 0x80) o.length = actionLength;
	
	return o;
}

// Type 60
function readDefineVideoStream(obj, tag, ba) {
	var vid = {};
	vid.type = 'Video';
	vid.id = ba.readUI16();
	vid.tag = 'defineVideoStream';
	vid.numFrames = ba.readUI16();
	vid.width = ba.readUI16();
	vid.height = ba.readUI16();
	ba.readUB(4); // Reserved
	
	/*
	000 = use VIDEOPACKET value
	001 = off
	010 = Level 1 (Fast deblocking filter)
	011 = Level 2 (VP6 only, better deblocking filter)
	100 = Level 3 (VP6 only, better deblocking plus fast deringing filter)
	101 = Level 4 (VP6 only, better deblocking plus better deringing filter)
	110 = Reserved
	111 = Reserved
	*/
	vid.deblocking = ba.readUB(3);
	
	// 0 = smoothing off (faster), 1 = smoothing on (higher quality)
	vid.smoothing = (ba.readUB(1) == 1);
	
	/*
	1 = JPEG (currently unused)
	2 = Sorenson H.263
	3 = Screen video (SWF 7 and	later only)
	4 = On2 VP6 (SWF 8 and later only)
	5 = On2 VP6 with alpha channel (SWF 8 and later only)
	6 = Screen video version 2 (SWF 9 and later only)
	7 = AVC (H.264) (SWF 9 and later only)
	*/
	vid.codecID = ba.readUI8();
	
	vid.data = '';
	vid.duration = 0;
	
	store(obj, vid);
	
	obj.videos = obj.videos || [];
	obj.videos.push(vid);
};

// Type 61
function readVideoFrame(obj, tag, ba) {
	// ID of video stream character of which this frame is a part
	var streamID = ba.readUI16(),
		i = null,
		l = obj.videos.length;
	for(var j = 0; j < l; j++) {
		if (obj.videos[j].id == streamID) {
			i = j;
			break;
		}
	}
	
	if(i != null) {
		// Sequence number of this frame within its video stream
		var frameNum = ba.readUI16();
		
		// FLV wrapper
		var ba2 = new Flashbug.ByteArrayString(),
			isFirst = false;
		if (obj.videos[i].data == '') {
			// Write FLV header //
			ba2.writeUTFBytes('FLV');
			ba2.writeUI8(1);
			ba2.writeUB(0, 5); // Reserved
			ba2.writeUB(0, 1); // Audio tags present, no becuase its streamed and gets combined with other streams
			ba2.writeUB(0, 1); // Reserved
			ba2.writeUB(1, 1); // Video tags present
			ba2.writeUI32(9); // Data Offset
			
			// Write FLV Body //
			ba2.writeUI32(0); // Previous Tag Size
			
			isFirst = true;
		}
		
		// Write FLV Tag //
		var isSpark = (obj.videos[i].codecID == 2);
		var isVP6 = (obj.videos[i].codecID == 4 || obj.videos[i].codecID == 5);
		var vidFrame = ba.readBytes(tag.contentLength - 4);
		var vidLength = isVP6 ? vidFrame.length + 2 : isSpark ? vidFrame.length + 1 : vidFrame.length;
		
		// Tag type. 8/audio 9/video 18/script
		ba2.writeUI8(9); 
		
		// Data size
		ba2.writeUI24(vidLength);
		
		// Time in ms at which the data in this tag applies. 
		// This value is relative to the first tag in the FLV file, which always has a timestamp of 0.
		// Not perfect, but very close
		ba2.writeUI24((frameNum / obj.frameRate) * 1000);
		
		// Extension of the Timestamp field to form a SI32 value.
		// This field represents the upper 8 bits, while the previous Timestamp field represents the lower 24 bits of the time in milliseconds.
		ba2.writeUI8(0);
		
		// StreamID, always 0
		ba2.writeUI24(0); 
		
		// Write VideoData
		if (isVP6 || isSpark) {
			/*
			FrameType
			1: keyframe (for AVC, a seekable frame)
			2: inter frame (for AVC, a nonseekable frame)
			3: disposable inter frame (H.263 only)
			4: generated keyframe (reserved for server use only)
			5: video info/command frame
			*/
			ba2.writeUB(isFirst ? 1 : 2, 4);
			
			/*
			CodecID
			1 = JPEG (currently unused)
			2 = Sorenson H.263
			3 = Screen video (SWF 7 and	later only)
			4 = On2 VP6 (SWF 8 and later only)
			5 = On2 VP6 with alpha channel (SWF 8 and later only)
			6 = Screen video version 2 (SWF 9 and later only)
			7 = AVC (H.264) (SWF 9 and later only)
			*/
			ba2.writeUB(obj.videos[i].codecID, 4);
		}
		
		if (isVP6) {
			// Some sort of offset? 128 is arbitrary, doesn't seem to impact anything
			var n = (obj.videos[i].codecID == 4) ? 0 : 128;
			ba2.writeUI8(n);
		}
		ba2.writeBytes(vidFrame);
		
		// Size of previous tag, including its header. //
		// For FLV version 1, this value is 11 plus the DataSize of the previous tag.
		ba2.writeUI32(vidLength + 11);
		
		// Increase duration
		obj.videos[i].duration += 20; // TODO: Figure out frame duration in MS
		
		obj.videos[i].data += ba2._buffer;
	} else {
		dump('readVideoFrame - unable to find video\n');
	}
};

// Type 62
/*
DefineFontInfo2 is identical to DefineFontInfo, except that
it adds a field for a language code. If you use the older DefineFontInfo, the language code will
be assumed to be zero, which results in behavior that is dependent on the locale in which
Flash Player is running.

The minimum file format version is SWF 6.
*/
function readDefineFontInfo2(obj, tag, ba) {
	readDefineFontInfo(obj, tag, ba, true);
};

// Type 63
function readDebugID(obj, tag, ba) {
	obj.uuid = ba.readString(tag.contentLength);
}

// Type 64
function readEnableDebugger2(obj, tag, ba) {
	readEnableDebugger(obj, tag, ba, true);
};

// Type 65
function readScriptLimits(obj, tag, ba) {
	obj.maxRecursionDepth = ba.readUI16();
	obj.scriptTimeoutSeconds = ba.readUI16();
}

// Type 66
function readSetTabIndex(obj, tag, ba) {
	obj.depth = ba.readUI16();
	obj.tabIndex = ba.readUI16();
}

// Type 69
function readFileAttributes(obj, tag, ba) {
	var flags = ba.readUI8();
	// If 1, the SWF file uses hardware acceleration to blit graphics to the screen, where such acceleration is available.
	// If 0, the SWF file will not use hardware accelerated graphics facilities.
	// Minimum file version is 10
	obj.useDirectBlit = ((flags & 0x40) != 0);
	
	// If 1, the SWF file uses GPU compositing features when drawing graphics, where such acceleration is available.
	// If 0, the SWF file will not use hardware accelerated graphics facilities.
	// Minimum file version is 10
	obj.useGPU = ((flags & 0x20) != 0);
	
	// If 1, the SWF file contains the Metadata tag.
	// If 0, the SWF file does not contain the Metadata tag
	obj.hasMetadata = ((flags & 0x10) != 0);
	
	// If 1, this SWF uses ActionScript 3.0.
	// If 0, this SWF uses ActionScript 1.0 or 2.0.
	// Minimum file format version is 9.
	obj.actionscript3 = ((flags & 0x08) != 0);
	
	// If 1, this SWF file is given network file access when loaded locally.
	// If 0, this SWF file is given local file access when loaded locally
	obj.useNetwork = ((flags & 0x01) != 0);
	ba.readByte();
	ba.readByte();
	ba.readByte();
};

// Type 70
function readPlaceObject3(obj, tag, ba) {
	obj.stage = obj.stage || [];
	var o = {
		frame: obj.frameIndex,
		hasClipActions: ba.readBoolean(),
		hasClipDepth: ba.readBoolean(),
		hasName: ba.readBoolean(),
		hasRatio: ba.readBoolean(),
		hasColorTransform: ba.readBoolean(),
		hasMatrix: ba.readBoolean(),
		hasCharacter: ba.readBoolean(),
		move: ba.readBoolean()
	};
	ba.readUB(3) // Reserved, must be 0
	o.hasImage = ba.readBoolean();
	o.hasClassName = ba.readBoolean();
	o.hasCacheAsBitmap = ba.readBoolean();
	o.hasBlendMode = ba.readBoolean();
	o.hasFilterList = ba.readBoolean();
	o.depth = ba.readUI16();
	
	if (o.hasClassName || (o.hasImage && o.hasCharacter)) o.className = ba.readString();
	if (o.hasCharacter) o.id = ba.readUI16();
	if (o.hasMatrix) o.matrix = ba.readMatrix();
	if (o.hasColorTransform) o.colorTransform = ba.readCXFormWithAlpha();
	if (o.hasRatio) o.ratio = ba.readUI16();
	if (o.hasName) o.name = ba.readString();
	if (o.hasClipDepth) o.clipDepth = ba.readUI16();
	if (o.hasFilterList) o.surfaceFilterList = readFilterList(obj,tag, ba);
	if (o.hasBlendMode) o.blendMode = ba.readUI8();
	if (o.hasCacheAsBitmap) o.bitmapCache = ba.readUI8();
	if (o.hasClipActions) o.clipActions = readClipActions(obj, tag, ba);
	
	obj.stage.push(o);
	trace2('readPlaceObject3', o);
}

function readFilterList(obj, tag, ba) {
	var o = [], numberOfFilters = ba.readUI8();
	while (numberOfFilters--) {
		o.push(readFilter(obj, tag, ba));
	}
	return o;
}

function readFilter(obj, tag, ba) {
	var o = {
		id: ba.readUI8()
	};
	if (o.id == 0) o.dropShadowFilter = readDropShadowFilter(obj, tag, ba);
	if (o.id == 1) o.blurFilter = readBlurFilter(obj, tag, ba);
	if (o.id == 2) o.glowFilter = readGlowFilter(obj, tag, ba);
	if (o.id == 3) o.bevelFilter = readBevelFilter(obj, tag, ba);
	if (o.id == 4) o.gradientGlowFilter = readGradientGlowFilter(obj, tag, ba);
	if (o.id == 5) o.convolutionFilter = readConvolutionFilter(obj, tag, ba);
	if (o.id == 6) o.colorMatrixFilter = readColorMatrixFilter(obj, tag, ba);
	if (o.id == 7) o.gradientBevelFilter = readGradientBevelFilter(obj, tag, ba);
	return o;
}

function readDropShadowFilter(obj, tag, ba) {
	var o = {
		dropShadowColor: ba.readRGBA(),
		blurX: ba.readFixed(),
		blurY: ba.readFixed(),
		angle: ba.readFixed(),
		distance: ba.readFixed(),
		strength: ba.readFixed8(),
		innerShadow: ba.readBoolean(),
		knockout: ba.readBoolean(),
		compositeSource: ba.readBoolean(),
		passes: ba.readUB(5)
	};
	return o;
}

function readBlurFilter(obj, tag, ba) {
	var o = {
		blurX: ba.readFixed(),
		blurY: ba.readFixed(),
		passes: ba.readUB(5)
	};
	ba.readUB(3); // Reserved, must be 0;
	return o;
}

function readGlowFilter(obj, tag, ba) {
	var o = {
		glowColor: ba.readRGBA(),
		blurX: ba.readFixed(),
		blurY: ba.readFixed(),
		strength: ba.readFixed8(),
		innerGlow: ba.readBoolean(),
		knockout: ba.readBoolean(),
		compositeSource: ba.readBoolean(),
		passes: ba.readUB(5)
	};
	return o;
}

function readGradientGlowFilter(obj, tag, ba) {
	var o = {
		numColors: ba.readUI8(),
		gradientColors: [],
		gradientRatio: []
	},
	
	i = o.numColors;
	while (i--) {
		o.gradientColors.push(ba.readRGBA());
	}
	
	i = o.numColors;
	while (i--) {
		o.gradientRatio.push(ba.readUI8());
	}
	
	o.blurX = ba.readFixed();
	o.blurY = ba.readFixed();
	o.angle = ba.readFixed();
	o.distance = ba.readFixed();
	o.strength = ba.readFixed8();
	o.innerShadow = ba.readBoolean();
	o.knockout = ba.readBoolean();
	o.compositeSource = ba.readBoolean();
	o.onTop = ba.readBoolean();
	o.passes = ba.readUB(4);
		
	return o;
}

function readBevelFilter(obj, tag, ba) {
	var o = {
		shadowColor: ba.readRGBA(),
		highlightColor: ba.readRGBA(),
		blurX: ba.readFixed(),
		blurY: ba.readFixed(),
		angle: ba.readFixed(),
		distance: ba.readFixed(),
		strength: ba.readFixed8(),
		innerShadow: ba.readBoolean(),
		knockout: ba.readBoolean(),
		compositeSource: ba.readBoolean(),
		onTop: ba.readBoolean(),
		passes: ba.readUB(5)
	};
	return o;
}

function readGradientBevelFilter(obj, tag, ba) {
	return readGradientGlowFilter(obj, tag, ba);
}

function readConvolutionFilter(obj, tag, ba) {
	var o = {};
	o.matrixX = ba.readUI8();
	o.matrixY = ba.readUI8();
	o.divisor = ba.readFloat();
	o.bias = ba.readFloat();
	o.matrix = []
	var i = o.matrixX * o.matrixY;
	while (i--) {
		o.matrix.push(ba.readFloat());
	}
	o.defaultColor = ba.readRGBA();
	ba.readUB(6); // Reserved, must be 0
	o.clamp = ba.readBoolean();
	o.preserveAlpha = ba.readBoolean();
	return o;
}

function readColorMatrixFilter(obj, tag, ba) {
	var o = [], i = 20;
	while (i--) {
		o.push(ba.readFloat());
	}
	return o;
}

// Type 71
function readImportAssets2(obj, tag, ba) {
	readImportAssets(obj, tag, ba, true);
}

// Type 74
function readCSMTextSettings(obj, tag, ba) {
	var id = ba.readUI16(),
		txt = obj.dictionary[id];
	txt.csm = {};
	txt.csm.useFlashType = ba.readUB(2);
	txt.csm.gridFit = ba.readUB(3);
	ba.readUB(3); // Reserved, always 0
	txt.csm.thickness = ba.readFixed();
	txt.csm.sharpness = ba.readFixed();
	ba.readUI8(); // Reserved, always 0
}

// Type 75
/*
The DefineFont3 tag extends the functionality of DefineFont2 by expressing the SHAPE
coordinates in the GlyphShapeTable at 20 times the resolution. All the EMSquare coordinates
are multiplied by 20 at export, allowing fractional resolution to 1/20 of a unit. This allows for
more precisely defined glyphs and results in better visual quality.

The minimum file format version is SWF 8.
*/
function readDefineFont3(obj, tag, ba) {
	//GlyphShapeTable at 20 times resolution
	readDefineFont2(obj, tag, ba, true);
};

// Type 76
function readSymbolClass(obj, tag, ba) {
	readExportAssets(obj, tag, ba);
};

// Type 77
function readMetadata(obj, tag, ba) {
	obj.metadata = ba.readString();
};

// Type 82
function readDoABC(obj, tag, ba) {
	var startPos = ba.position;
	/*
	A 32-bit flags value, which may
	contain the following bits set:
	kDoAbcLazyInitializeFlag = 1:
	Indicates that the ABC block
	should not be executed
	immediately, but only parsed. A
	later finddef may cause its
	scripts to execute.
	*/
	obj.flags = ba.readUI32();
	obj.name = ba.readString();
	
	/*
	A block of .abc bytecode to be
	parsed by the ActionScript 3.0
	virtual machine, up to the end
	of the tag.
	*/
	obj.ABCData = ba.readBytes(tag.contentLength - (ba.position - startPos));
	// www.adobe.com/go/avm2overview/
}

// Type 83
function readDefineShape4(obj, tag, ba) {
	readDefineShape(obj, tag, ba, true, true);
}

// Type 84
// http://www.toyota.com/vehicles/minisite/newprius/media/swf/PriusGraphics.swf
function readDefineMorphShape2(obj, tag, ba) {
	readDefineMorphShape(obj, tag, ba, true);
}

// Type 86
function readDefineSceneAndFrameLabelData(obj, tag, ba) {
	obj.scenes = [];
	obj.frameLabels = [];
	var sceneCount = ba.readEncodedU32();
	while (sceneCount--) {
		obj.scenes.push({ offset:ba.readEncodedU32(), name:ba.readString()});
	}
	var frameLabelCount = ba.readEncodedU32();
	while (frameLabelCount--) {
		obj.frameLabels.push({ frameNum:ba.readEncodedU32(), frameLabel:ba.readString()});
	}
}

// Type 87
function readDefineBinaryData(obj, tag, ba) {
	var startPos = ba.position;
	var bd = {};
	bd.type = 'Binary';
	bd.id = ba.readUI16();
	bd.tag = 'defineBinaryData';
	ba.readUI32(); // Reserved
	bd.data = ba.readBytes(tag.contentLength - (ba.position - startPos));
	
	// Is PixelBender? http://dl.dropbox.com/u/340823/Flashbug%20Demo.swf
	try {
		function getType(t) {
			switch(t) {
				case 0x01: return 'TFloat';
				case 0x02: return 'TFloat2';
				case 0x03: return 'TFloat3';
				case 0x04: return 'TFloat4';
				case 0x05: return 'TFloat2x2';
				case 0x06: return 'TFloat3x3';
				case 0x07: return 'TFloat4x4';
				case 0x08: return 'TInt';
				case 0x09: return 'TInt2';
				case 0x0A: return 'TInt3';
				case 0x0B: return 'TInt4';
				case 0x0C: return 'TString';
				default: return "Unknown type 0x" + t.toString(16);
			}
		}
		
		function readValue(t, ba2) {
			switch(t) {
				case 0x01:
					return {f1:ba2.readFloat(false)};
				case 0x02:
					return { f1:ba2.readFloat(false), f2:ba2.readFloat(false)};
				case 0x03:
					return { f1:ba2.readFloat(false), f2:ba2.readFloat(false), f3:ba2.readFloat(false)};
				case 0x04:
					return { f1:ba2.readFloat(false), f2:ba2.readFloat(false), f3:ba2.readFloat(false), f4:ba2.readFloat(false)};
				case 0x05:
					var a = [], i = 4;
					while (i--) {
						a.push(ba2.readFloat(false));
					}
					return a;
				case 0x06:
					var a = [], i = 9;
					while (i--) {
						a.push(ba2.readFloat(false));
					}
					return a;
				case 0x07:
					var a = [], i = 16;
					while (i--) {
						a.push(ba2.readFloat(false));
					}
					return a;
				case 0x08:
					return ba2.readUI16(false);
				case 0x09:
					return {i1:ba2.readUI16(false), il2:ba2.readUI16(false)};
				case 0x0A:
					return {i1:ba2.readUI16(false), il2:ba2.readUI16(false), i3:ba2.readUI16(false)};
				case 0x0B:
					return {i1:ba2.readUI16(false), il2:ba2.readUI16(false), i3:ba2.readUI16(false), i4:ba2.readUI16(false)};
				case 0x0C:
					return ba2.readString();
			};
			return null;
		}

		function readOPCode(ba2, bd) {
			var op = ba2.readUI8();
			switch(op) {
				case 0xA0 : /* Kernel Metadata */
					bd.isPBJ = true;
					bd.pbMetadata = bd.pbMetadata || {};
					
					var type = ba2.readByte();
					var key = ba2.readString();
					var value = readValue(type, ba2);
					bd.pbMetadata[key] = value;
					break;
				case 0xA1 : /* Parameter */
					bd.isPBJ = true;
					bd.pbParams = bd.pbParams || [];
					
					var qualifier = ba2.readByte();
					var type = ba2.readByte();
					var reg = ba2.readUI16(false);
					var mask = ba2.readByte();
					var name = ba2.readString();
					switch(type) {
						case 0x05: mask = 0xF;
						case 0x06: mask = 0xF;
						case 0x07: mask = 0xF;
					}
					
					bd.pbParams.push({ name:name, metas:{}, type:getType(type), out:qualifier == 2/*, reg:dstReg(reg,mask) */});
					break;
				case 0xA2 : /* Parameter Metadata */
					bd.isPBJ = true;
					bd.pbParams = bd.pbParams || [];
					
					var type = ba2.readByte();
					var key = ba2.readString();
					var value = readValue(type, ba2);
					bd.pbParams[bd.pbParams.length - 1].metas[key] = value;
					break;
				case 0xA3 : /* Texture */
					bd.isPBJ = true;
					bd.pbTextures = bd.pbTextures || [];
					
					var index = ba2.readByte();
					var channels = ba2.readByte();
					var name = ba2.readString();
					bd.pbTextures.push({ name:name, metas:{}, channels:channels, index:index });
					break;
				case 0xA4 : /* Name */
					var len = ba2.readUI16(false);
					bd.isPBJ = true;
					bd.pbName = ba2.readString(len);
					break;
				case 0xA5 : /* Version */
					bd.isPBJ = true;
					bd.pbVersion = ba2.readUI32(false);
					break;
				
			}
			return op;
		}
		
		var ba2 = new Flashbug.ByteArrayString(bd.data);
		var op;
		do {
			op = readOPCode(ba2, bd);
		} while(op >= 0xA0 && op <= 0xA5);
	} catch(e) {
		dump('readDefineBinaryData ' + e + '\n');
	}
	
	// Is SWF? http://s.ytimg.com/yt/swfbin/watch_as3-vflwQAc_A.swf
	try {
		var ba2 = new Flashbug.ByteArrayString(bd.data);
		var signature = ba2.readString(3);
		if (signature == "CWS") {
			bd.isSWF = true;
		} else if(signature == "FWS") {
			bd.isSWF = true;
		}
	} catch(e) {
		dump('readDefineBinaryData ' + e + '\n');
	}
	
	// Is GIF?
	try {
		var ba2 = new Flashbug.ByteArrayString(bd.data);
		var signature = ba2.readString(6);
		if (signature == "GIF89a") bd.isGIF = true;
	} catch(e) {
		dump('readDefineBinaryData ' + e + '\n');
	}
	
	// Is XML? http://www.hulu.com/site-player/110075/player.swf?cb=110075
	try {
		var ba2 = new Flashbug.ByteArrayString(bd.data);
		var signature = ba2.readString(5);
		if (signature == "<?xml") bd.isXML = true;
	} catch(e) {
		dump('readDefineBinaryData ' + e + '\n');
	}
	
	store(obj, bd);
	
	if (typeof obj.binary == "undefined") obj.binary = [];
	obj.binary.push(bd);
};

// Type 88
function readDefineFontName(obj, tag, ba) {
	var id = ba.readUI16(),
		font = obj.dictionary[id];
	font.info = font.info || {};
	font.info.name = ba.readString();
	font.info.copyright = ba.readString();
};

// Type 90
/*
This tag defines a bitmap character with JPEG compression. This tag extends
DefineBitsJPEG3, adding a deblocking parameter. While this tag also supports PNG and
GIF89a data, the deblocking filter is not applied to such data.

The minimum file format version for this tag is SWF 10.
*/
function readDefineBitsJPEG4(obj, tag, ba) {
	readDefineBits(obj, tag, ba, true, true);
};

// Type 91
/*
DefineFont4 supports only the new Flash Text Engine. The storage of font data for embedded
fonts is in CFF format.

The minimum file format version is SWF 10.
*/
function readDefineFont4(obj, tag, ba) {
	var startPos = ba.position;
	
	var font = {};
	font.type = 'Font';
	font.id = ba.readUI16();
	font.tag = 'defineFont4';
	ba.readUB(5); // Reserved
	font.hasFontData = ba.readUB(1);
	font.info = {};
	font.info.isItalics = ba.readUB(1);
	font.info.isBold = ba.readUB(1);
	font.info.name = ba.readString(); // Given ID, not actual name
	
	// CFF (OTF) Font
	if (font.hasFontData) {
		font.data = ba.readBytes(tag.contentLength - (ba.position - startPos));
		try {
			var fontName = new Flashbug.CFFUtil(new Flashbug.ByteArrayString(font.data)).getFontName();
			if(fontName.length > 0) font.info.name = fontName;
		} catch(e) {
			dump('readDefineFont4 ' + e);
		}
	}
	font.name = font.info.name;
	
	store(obj, font);
	
	if (typeof obj.fonts == "undefined") obj.fonts = [];
	obj.fonts.push(font);
};

// Type 253
function readAmayetaSWFEncrypt(obj, tag, ba) {
	obj.amayetaSWFEncrypt = ba.readBytes(tag.contentLength);
};

// Type 255
function readAmayetaSWFEncrypt6(obj, tag, ba) {
	obj.amayetaSWFEncrypt6 = ba.readBytes(tag.contentLength);
};

// Type 264
function readObfuEncryption(obj, tag, ba) {
	obj.obfuEncryption = ba.readBytes(tag.contentLength);
};

// Type 1002
function readSWFProtector3(obj, tag, ba) {
	obj.swfProtector3 = ba.readBytes(tag.contentLength);
};

// Type 1022
function readAmayetaSWFCompress1(obj, tag, ba) {
	obj.amayetaSWFCompress1 = ba.readBytes(tag.contentLength);
};

// Unknown
function skipTag(obj, tag, ba) {
	ba.seek(tag.contentLength); // Skip bytes
};

/////////////////////////////////////////////////////////
// Tag header
/////////////////////////////////////////////////////////

const TAGS = {};
TAGS[-1] = {name:'Header', 				func:skipTag }; // Player use

TAGS[0] = {name:'End', 					func:readEnd };
TAGS[1] = {name:'ShowFrame', 			func:readShowFrame }; // Player use
TAGS[2] = {name:'DefineShape', 			func:readDefineShape };
TAGS[3] = {name:'FreeCharacter', 			func:skipTag }; // Undocumented - SWF1
TAGS[4] = {name:'PlaceObject', 			func:readPlaceObject }; // Player use
TAGS[5] = {name:'RemoveObject', 			func:skipTag }; // Player use
TAGS[6] = {name:'DefineBits', 			func:readDefineBits };
TAGS[7] = {name:'DefineButton', 			func:skipTag }; // Player use
TAGS[8] = {name:'JPEGTables', 			func:readJPEGTables };
TAGS[9] = {name:'SetBackgroundColor', 	func:readSetBackgroundColor };

TAGS[10] = {name:'DefineFont', 			func:readDefineFont };
TAGS[11] = {name:'DefineText', 			func:readDefineText };
TAGS[12] = {name:'DoAction', 			func:readDoAction };
TAGS[13] = {name:'DefineFontInfo',		func:readDefineFontInfo };
TAGS[14] = {name:'DefineSound', 		func:readDefineSound };
TAGS[15] = {name:'StartSound', 				func:skipTag }; // Player use
TAGS[16] = {name:'StopSound', 				func:skipTag }; // Undocumented -  SWF2
TAGS[17] = {name:'DefineButtonSound', 		func:skipTag }; // Player use
TAGS[18] = {name:'SoundStreamHead', 	func:readSoundStreamHead };
TAGS[19] = {name:'SoundStreamBlock', 	func:readSoundStreamBlock };

TAGS[20] = {name:'DefineBitsLossless', func:readDefineBitsLossless };
TAGS[21] = {name:'DefineBitsJPEG2', 	func:readDefineBitsJPEG2 };
TAGS[22] = {name:'DefineShape2', 		func:readDefineShape2 };
TAGS[23] = {name:'DefineButtonCxform', 		func:skipTag }; // Player use
TAGS[24] = {name:'Protect', 			func:readProtect };
TAGS[25] = {name:'PathsArePostscript', 		func:skipTag }; // Undocumented - SWF3
TAGS[26] = {name:'PlaceObject2', 		func:readPlaceObject2 }; // Player use
TAGS[27] = {name:'UNKNOWN 27', 				func:skipTag }; // Undocumented
TAGS[28] = {name:'RemoveObject2', 			func:skipTag }; // Player use
TAGS[29] = {name:'SyncFrame', 				func:skipTag }; // Undocumented - SWF3

TAGS[30] = {name:'UNKNOWN 30', 				func:skipTag }; // Undocumented
TAGS[31] = {name:'FreeAll', 				func:skipTag }; // Undocumented - SWF3
TAGS[32] = {name:'DefineShape3', 		func:readDefineShape3 };
TAGS[33] = {name:'DefineText2', 		func:readDefineText2 };
TAGS[34] = {name:'DefineButton2', 			func:skipTag }; // Player use
TAGS[35] = {name:'DefineBitsJPEG3', 	func:readDefineBitsJPEG3 };
TAGS[36] = {name:'DefineBitsLossless2', func:readDefineBitsLossless2 };
TAGS[37] = {name:'DefineEditText', 		func:readDefineEditText };
TAGS[38] = {name:'DefineVideo', 			func:skipTag }; // Undocumented - SWF4
TAGS[39] = {name:'DefineSprite', 		func:readDefineSprite };

TAGS[40] = {name:'NameCharacter', 		func:readNameCharacter }; // Undocumented/Generator - SWF3
// Undocumented 41 - This tag defines information about the product used to generate the animation. 
// The product identifier should be unique among all the products. The info includes a product identifier, 
// a product edition, a major and minor version, a build number and the date of compilation. All of this 
// information is all about the generator, not the output movie.
TAGS[41] = {name:'ProductInfo', 		func:readProductInfo };
TAGS[42] = {name:'DefineTextFormat', 		func:skipTag }; // Undocumented - SWF1
TAGS[43] = {name:'FrameLabel', 			func:readFrameLabel };
TAGS[44] = {name:'DefineBehavior', 			func:skipTag }; // Undocumented
TAGS[45] = {name:'SoundStreamHead2', 	func:readSoundStreamHead2 };
TAGS[46] = {name:'DefineMorphShape', 	func:readDefineMorphShape };
TAGS[47] = {name:'GenerateFrame', 			func:skipTag }; // Undocumented - SWF3
TAGS[48] = {name:'DefineFont2', 		func:readDefineFont2 };
TAGS[49] = {name:'GeneratorCommand', 	func:readGeneratorCommand }; // Undocumented/Generator - Gives information about what generated this SWF and its version. SWF3

TAGS[50] = {name:'DefineCommandObject', 	func:skipTag }; // Undocumented - SWF5
TAGS[51] = {name:'CharacterSet', 		func:readCharacterSet }; // Undocumented/Generator - SWF5
TAGS[52] = {name:'ExternalFont', 			func:skipTag }; // Undocumented - SWF5
TAGS[52] = {name:'DefineFunction', 			func:skipTag }; // Undocumented
TAGS[54] = {name:'PlaceFunction', 			func:skipTag }; // Undocumented
TAGS[55] = {name:'GeneratorTagObject', 		func:skipTag }; // Undocumented
TAGS[56] = {name:'ExportAssets', 		func:readExportAssets };
TAGS[57] = {name:'ImportAssets', 		func:readImportAssets }; // Deprecated SWF8
TAGS[58] = {name:'EnableDebugger', 		func:readEnableDebugger };
TAGS[59] = {name:'DoInitAction', 		func:readDoInitAction };

TAGS[60] = {name:'DefineVideoStream', 	func:readDefineVideoStream };
TAGS[61] = {name:'VideoFrame', 			func:readVideoFrame };
TAGS[62] = {name:'DefineFontInfo2', 	func:readDefineFontInfo2 };
// Undocumented - This tag is used when debugging an SWF movie. 
// It gives information about what debug file to load to match the SWF movie with the source. The identifier is a UUID. SWF6
TAGS[63] = {name:'DebugID', 			func:readDebugID }; // Undocumented - SWF6
TAGS[64] = {name:'EnableDebugger2', 	func:readEnableDebugger2 };
TAGS[65] = {name:'ScriptLimits', 		func:readScriptLimits };
TAGS[66] = {name:'SetTabIndex', 		func:readSetTabIndex };
TAGS[67] = {name:'DefineShape4_', 			func:skipTag }; // Undocumented
TAGS[68] = {name:'DefineMorphShape2_', 		func:skipTag }; // Undocumented
TAGS[69] = {name:'FileAttributes', 		func:readFileAttributes };

TAGS[70] = {name:'PlaceObject3', 		func:readPlaceObject3 }; // Player use
TAGS[71] = {name:'ImportAssets2', 		func:readImportAssets2 };
TAGS[72] = {name:'DoABCDefine', 			func:skipTag }; // <<<<<<<<<<<<<<<<<<< TODO
TAGS[73] = {name:'DefineFontAlignZones', 	func:skipTag }; // Player use
TAGS[74] = {name:'CSMTextSettings', 	func:readCSMTextSettings };
TAGS[75] = {name:'DefineFont3', 		func:readDefineFont3 };
TAGS[76] = {name:'SymbolClass', 		func:readSymbolClass };
TAGS[77] = {name:'Metadata', 			func:readMetadata };
TAGS[78] = {name:'DefineScalingGrid', 		func:skipTag }; // Player use
TAGS[79] = {name:'UNKNOWN 79', 				func:skipTag }; // Undocumented

TAGS[80] = {name:'UNKNOWN 80', 				func:skipTag }; // Undocumented
TAGS[81] = {name:'UNKNOWN 81', 				func:skipTag }; // Undocumented
TAGS[82] = {name:'DoABC', 				func:readDoABC }; // <<<<<<<<<<<<<<<<<<< TODO
TAGS[83] = {name:'DefineShape4', 		func:readDefineShape4 };
TAGS[84] = {name:'DefineMorphShape2', 	func:readDefineMorphShape2 };
TAGS[85] = {name:'UNKNOWN 85', 				func:skipTag }; // Undocumented
TAGS[86] = {name:'DefineSceneAndFrameLabelData', func:readDefineSceneAndFrameLabelData };
TAGS[87] = {name:'DefineBinaryData', 	func:readDefineBinaryData };
TAGS[88] = {name:'DefineFontName', 		func:readDefineFontName };
TAGS[89] = {name:'StartSound2', 			func:skipTag }; // Player use

TAGS[90] = {name:'DefineBitsJPEG4', 	func:readDefineBitsJPEG4 };
TAGS[91] = {name:'DefineFont4', 		func:readDefineFont4 };

// ? copied from Ming
TAGS[777] = {name:'Reflex ?', 					func:skipTag };
// [unknown data][action block][<end>][branch]
TAGS[253] = {name:'Amayeta SWF Encrypt ?', 		func:readAmayetaSWFEncrypt };
TAGS[255] = {name:'Amayeta SWF Encrypt 6', 		func:readAmayetaSWFEncrypt6 };
TAGS[264] = {name:'Obfu Encryption', 			func:readObfuEncryption };
TAGS[1002] = {name:'SWF Protector 3', 			func:readSWFProtector3 };
TAGS[1022] = {name:'Amayeta SWF Compress 1', 	func:readAmayetaSWFCompress1 };
// ? copied from Ming
TAGS[1023] = {name:'DefineBitsPtr ?', 			func:skipTag };

function readTagHeader(obj, ba) {
	try {
		var pos = ba.position;
		var tag = {};
		var tagTypeAndLength = ba.readUI16();
		tag.contentLength = tagTypeAndLength & 0x003F;
		
		// Long header
		if (tag.contentLength == 0x3F) tag.contentLength = ba.readSI32();
		
		tag.type = tagTypeAndLength >> 6;
		tag.headerLength = ba.position - pos;
		tag.tagLength = tag.headerLength + tag.contentLength;
		return tag;
	} catch (err) {
		trace2('readTagHeader', err);
		return null;
	}
}

function readHeader(obj, ba) {
	var signature = ba.readString(3);
	
	obj.isCompressed = false;
	if(signature == "CWS") {
		obj.isCompressed = true;
	} else if(signature != "FWS") {
		obj.error = "swf";
		return null; // Not a SWF
	}
	
	obj.version = ba.readUI8();
	obj.fileLength = ba.readUI32();
	obj.fileLength = formatSize(obj.fileLength) + " (" + formatNumber(obj.fileLength) + ")";
	
	var parseLimit = config.headerOnly ? 1000 : 0;
	if(obj.isCompressed) {
		obj.fileLengthCompressed = formatSize(ba.length) + " (" + formatNumber(ba.length) + ")";
		//ba.deflate(parseLimit);
		ba = new Flashbug.ZipUtil(ba).deflate(parseLimit);
	}
	
	obj.frameSize = ba.readRect();
	obj.frameSize.left /= 20; /* twips */
	obj.frameSize.right /= 20; /* twips */
	obj.frameSize.top /= 20; /* twips */
	obj.frameSize.bottom /= 20; /* twips */
	obj.frameRate = ba.readUI16() / 256;
	obj.frameCount = ba.readUI16();
	
	return ba;
};

function readTags(obj, ba) {
	if (typeof obj.tags == "undefined") obj.tags = [];
	var tag = readTagHeader(obj, ba);
	while(tag) {
		
		var o = TAGS[tag.type];
		if (o) {
			var f = o.func;
			var startPos = ba.position;
			//trace2(ba.position + ' - ' + TAGS[tag.type].name + ' (' + tag.type + ') - ' + tag.contentLength);
			
			// Read tag
			f(obj, tag, ba);
			
			// Re-align in the event a tag was read improperly
			if (0 != (tag.contentLength - (ba.position - startPos))) trace2('Error reading ' + TAGS[tag.type].name + ' tag! Start:' + startPos + ' End:' + ba.position + ' BytesAvailable:' + (tag.contentLength - (ba.position - startPos)), tag);
			ba.seek(tag.contentLength - (ba.position - startPos));
			
			// Only add tags we can read to the tags list
			if (f != skipTag) obj.tags.push(ba.position + ' - ' + TAGS[tag.type].name + ' (' + tag.type + ') - ' + tag.contentLength);
		} else {
			trace2('Unknown tag type', tag.type);
			skipTag(obj, tag, ba);
		}
		
		if (tag.type == 0) break;
		tag = readTagHeader(obj, ba);
	}
}

function Frame() {
	this.actions = [];
	this.label = '';
	this.displayList = [];
};

onmessage = function(event) {
	var ba = new Flashbug.ByteArrayString(event.data.text, Flashbug.ByteArrayString.LITTLE_ENDIAN);
	config = event.data.config;

	var obj = {};
	obj.streams = [];
	obj.dictionary = [];
	obj.stage = [new Frame()];
	obj.frames = [];
	obj.frameIndex = 1;
	ba = readHeader(obj, ba);
	if(!ba) {
		postMessage(obj);
		return;
	}
	
	readTags(obj, ba);
	
	postMessage(obj);
};