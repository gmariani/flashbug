importScripts('ByteArrayString.js', 'CFFUtil.js', 'WAVUtil.js', 'ZipUtil.js');

var config = {};
var soundStreamID = 1;
var hasSoundBlock = false;
var streams = [];
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

function store(obj, tag) {
	obj.dictionary[tag.id] = obj.dictionary[tag.id] || { };
	for (var prop in tag) {
		obj.dictionary[tag.id][prop] = tag[prop];
	}
}

function readGlyph(ba) {
	// Convert path into SVG commands
	var numFillBits = ba.readUB(4),
		numLineBits = ba.readUB(4),
		x = 0,
		y = 0,
		cmds = [],
		c = StyleChangeStates;
	do {
		var type = ba.readUB(1),
			flags = null;
		if (type) {
			var isStraight = ba.readBool(),
				numBits = ba.readUB(4) + 2;
			if (isStraight) {
				var isGeneral = ba.readBool();
				if (isGeneral) {
					x += ba.readSB(numBits);
					y += ba.readSB(numBits);
					cmds.push('L' + x + ',' + y); // lineto
				} else {
					var isVertical = ba.readBool();
					if (isVertical) {
						y += ba.readSB(numBits);
						cmds.push('V' + y); // vertical lineto
					} else {
						x += ba.readSB(numBits);
						cmds.push('H' + x); // horizontal lineto
					}
				}
			} else {
				var cx = x + ba.readSB(numBits),
					cy = y + ba.readSB(numBits);
				x = cx + ba.readSB(numBits);
				y = cy + ba.readSB(numBits);
				cmds.push('Q' + cx + ',' + cy + ',' + x + ',' + y); // quadratic Bézier curveto
			}
		} else {
			var flags = ba.readUB(5);
			if (flags) {
				if (flags & c.MOVE_TO) {
					var numBits = ba.readUB(5);
					x = ba.readSB(numBits);
					y = ba.readSB(numBits);
					cmds.push('M' + x + ',' + y); // moveto
				}
				if (flags & c.LEFT_FILL_STYLE || flags & c.RIGHT_FILL_STYLE){ ba.readUB(numFillBits); }
			}
		}
	} while(type || flags);
	ba.align();
	
	return {commands: cmds.join(' ')};
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
		var segments = [];
		for (var i = 0; fillStyles[i]; i++) {
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
						
					    for (var k = 0; list[k]; k++) {
							var entry = list[k];
							if(entry == favEdge && !entry.c) {
								list.splice(k, 1);
								nextEdge = entry;
							}
					    }
					    
					    if (!nextEdge) {
							for(var k = 0; list[k]; k++) {
								var entry = list[k];
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
			return style;
			break;
		case f.REPEATING_BITMAP:
		case f.CLIPPED_BITMAP:
			var imgId = ba.readUI16(),
				img = obj.dictionary[imgId],
				matrix = morph ? [ba.readMatrix(), ba.readMatrix()] : ba.readMatrix();
			if (img) {
				var style = {
					type: 'pattern',
					image: img,
					matrix: matrix,
					repeat: (type == f.REPEATING_BITMAP)
				};
				return style;
			} else {
				return null;
			}
			break;
	}
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
					width: [ba.readUI16(), ba.readUI16()],
					color: [ba.readRGBA(), ba.readRGBA()]
				});
			} else {
				styles.push({
					width: ba.readUI16(),
					color: withAlpha ? ba.readRGBA() : ba.readRGB()
				});
			}
		} else {
			// Read LINESTYLE2
			var style = {};
			style.width = ba.readUI16(),
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
				style.color = ba.readRGBA();
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
			if (x1 != x2 || y1 != y2 || !i) cmds.push('M' + x1 + ',' + y1);
			x2 = edge.x2;
			y2 = edge.y2;
			if (null == edge.cx || null == edge.cy) {
				if (x2 == x1) {
					cmds.push('V' + y2);
				} else if (y2 == y1) {
					cmds.push('H' + x2);
				} else {
					cmds.push('L' + x2 + ',' + y2);
				}
			} else {
				cmds.push('Q' + edge.cx + ',' + edge.cy + ',' + x2 + ',' + y2);
			}
		};
		if (!stroke && (x2 != firstEdge.x1 || y2 != firstEdge.y1)) cmds.push('L' + firstEdge.x1 + ',' + firstEdge.y1);
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
			fillAttr += ' stroke-width="' + max(line.width, 20) + '"';
		} else {
			var color = line.color instanceof Array ? line.color[morphIdx] : line.color,
				width = line.width instanceof Array ? line.width[morphIdx] : line.width,
				alpha = color.alpha;
			fillAttr += ' stroke="' + getColor(color, true) + '"';
			fillAttr += ' stroke-width="' + max(width, 20) + '"';
			if (undefined != alpha && alpha < 1) fillAttr += ' stroke-opacity="' + alpha + '"';
		}
		
		if (line.joinStyle == 2) fillAttr += ' stroke-miterlimit="' + line.miterLimitFactor + '"'; // Miter limit factor is an 8.8 fixed-point value.
		
		if (line.startCapStyle instanceof Number) {
			var lineCap = ['butt','round', 'square'];
			fillAttr += ' stroke-linecap="' + lineCap[line.startCapStyle] + '"'; // endCapStyle ignored for now
		}
		
		if (line.joinStyle instanceof Number) {
			var lineJoin = ['round','bevel','miter'];
			fillAttr += ' stroke-linejoin="' + lineJoin[line.joinStyle] + '"';
		}
		
		/*if (line.hasFillFlag) {
			trace2('getStyle fill', fill);
			trace2('getStyle line', line);
			trace2('getStyle id', id);
			trace2('getStyle fillAttr', fillAttr);
		}*/
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
			svg += '<pattern';
			svg += ' id="' + id + 'patternFill"';
			svg += ' patternUnits="userSpaceOnUse"';
			svg += ' patternTransform="' + getMatrix(fill.matrix, morphIdx) + '"';
			svg += ' width="' + fill.image.width + '"';
			svg += ' height="' + fill.image.height + '"';
			svg += '>';
			svg += '<use xlink:href="#i' + fill.image.id + '"/>';
			svg += '</pattern>';
			break;
	}
	
	return svg;
};

function getMatrix(matrix, morphIdx) {
	var matrix = matrix instanceof Array ? matrix[morphIdx] : matrix;
	return "matrix(" + [
		matrix.scaleX, matrix.skewX,
		matrix.skewY, matrix.scaleY,
		matrix.moveX, matrix.moveY
	] + ')';
};

function getColor(color) {
	return 'rgb(' + [color.red, color.green, + color.blue] + ')';
};

function convert2SVG(shp, morph, isStart) {
	if (morph) {
		var morphObj = shp;
		shp = isStart ? morphObj.start : morphObj.end;
		shp.fill = isStart ? shp.edges.fill : morphObj.start.fill;
		shp.line = isStart ? shp.edges.line : morphObj.start.line;
		shp.commands = edges2cmds(shp.edges.records, !!shp.line);
	}
	
	// Convert to SVG //
	var segments = shp.segments,
		b = shp.bounds,
		svg = '',
		morphIdx = morph ? isStart ? 0 : 1 : null;
	
	// SVG Header
	svg += '<g fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision" image-rendering="optimizeQuality"  text-rendering="geometricPrecision" color-rendering="optimizeQuality">';
	
	if (!segments) segments = [shp];
	var cmds = '';
	var defs = '<defs>';
	for (var i = 0, seg = segments[0]; seg; seg = segments[++i]) {
		var id = seg.id,
			fill = seg.fill,
			line = seg.line;
		
		if (fill && 'pattern' == fill.type && !fill.repeat) {
			defs += getFill(fill, id, morphIdx);
			// TODO: Figure out how to integrate SVG Image tag without doubling work when drawing HTML Image tag
			cmds += '<use xlink:href="#' + id + 'patternFill" transform="' + getMatrix(fill.matrix, morphIdx) + '" />';
		} else {
			if (fill && 'pattern' != fill.type) defs += getFill(fill, id, morphIdx);
			if (line && line.hasFillFlag) defs += getFill(line.fillType, id, morphIdx);
			cmds += '<path id="' + id + '" d="' + seg.commands + '"' + getStyle(fill, line, id, morphIdx) + ' />';
		}
	}
	
	// SVG Footer
	defs += '</defs>';
	svg += defs;
	svg += cmds;
	svg += '</g></svg>';
	
	// For displaying in Flashbug
	var maxWidth = 100,
		maxHeight = 80,
		w = (((b.right - b.left) / 20)),
		h = (((b.bottom - b.top) / 20)),
		vB = ('' + [b.left, b.top, b.right - b.left, b.bottom - b.top]),
		tw = w,
		th = h,
		tvB = '';
	
	if (w > maxWidth || h > maxHeight) {
		if (w > h) {
			tw = maxWidth;
			th = Math.round((h / w) * maxWidth);
		} else {
			tw = Math.round((w / h) * maxHeight);
			th = maxHeight;
		}
	}
	
	shp.svgHeaderThumb = '<svg preserveAspectRatio="none" width="' + tw + '" height="' + th + '" viewBox="' + vB + '">';
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
	if(hasSoundBlock) streams.pop();
};

// Type 2
function readDefineShape(obj, tag, ba, withAlpha, withLineV2) {
	
	// Read Shape //
	var id = ba.readUI16(),
		t = this,
		shp = {
			type: "shape",
			id: id,
			data: '',
			bounds: ba.readRect()
		};
	
	ba.align();
	
	if (withLineV2) {
		shp.edgeBounds = ba.readRect();
		ba.readUB(5); // Reserved
		shp.usesFillWindingRule = ba.readBool();
		shp.usesNonScalingStrokes = ba.readBool();
		shp.usesScalingStrokes = ba.readBool();
		ba.align();
	}
	
	var fillStyles = readFillStyleArray(ba, withAlpha, undefined, obj),
		lineStyles = readLineStyleArray(ba, withAlpha, withLineV2, undefined, obj),
		edges = readEdges(ba, fillStyles, lineStyles, withAlpha, withLineV2, undefined, obj);
		
	if (edges instanceof Array) {
		var segments = shp.segments = [];
		for (var i = 0, seg = edges[0]; seg; seg = edges[++i]) {
			segments.push({
				type: 'shape',
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
	
	convert2SVG(shp);
	
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
function readDefineBits(obj, tag, ba, withAlpha, withDeblock) {
	var id = ba.readUI16(), 
		h = obj.jpegTables,
		alphaDataOffset,
		img = {};
	img.type = 'image';
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
	
	// Determine Type
	/*var ba2 = new Flashbug.ByteArrayString(ba.readBytes(alphaDataOffset), Flashbug.ByteArrayString.LITTLE_ENDIAN);
	img.bitmapData = ba2._buffer;
	var bitmapData = [ba2.readByte(), ba2.readByte(), ba2.readByte(), ba2.readByte(), ba2.readByte(), ba2.readByte(), ba2.readByte(), ba2.readByte()];
	
	if (bitmapData[0] == 0xff && (bitmapData[1] == 0xd8 || bitmapData[1] == 0xd9)) {
		img.bitmapType = 'JPEG';
	} else if (bitmapData[0] == 0x89 && bitmapData[1] == 0x50 && bitmapData[2] == 0x4e && bitmapData[3] == 0x47 && bitmapData[4] == 0x0d && bitmapData[5] == 0x0a && bitmapData[6] == 0x1a && bitmapData[7] == 0x0a) {
		img.bitmapType = 'PNG';
	} else if (bitmapData[0] == 0x47 && bitmapData[1] == 0x49 && bitmapData[2] == 0x46 && bitmapData[3] == 0x38 && bitmapData[4] == 0x39 && bitmapData[5] == 0x61) {
		img.bitmapType = 'GIF89a';
	}*/
	
	// Determine dimensions
	for (var i = 0; data[i]; i++) {
		var word = ((data.charCodeAt(i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
		if (0xffd9 == word) {
			word = ((data.charCodeAt(++i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
			if(word == 0xffd8){
				data = data.substr(0, i - 4) + data.substr(i);
				i -= 4;
			}
		} else if (0xffc0 == word) {
			i += 3;
			img.height = ((data.charCodeAt(++i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
			img.width = ((data.charCodeAt(++i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
			break;
		}
	}
	img.data = h ? h.substr(0, h.length - 2) + data.substr(2) : data;
	
	if (withAlpha && withDeblock) {
		img.tag = 'defineBitsJPEG4';
	} else if (withAlpha) {
		img.tag = 'defineBitsJPEG3';
	} else {
		img.tag = 'defineBits';
	}
	
	store(obj, img);
	
	if(typeof obj.images == "undefined") obj.images = [];
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
	//if(obj.backgroundColor == -1) obj.backgroundColor = 0xFFFFFF;
	//obj.backgroundColor = "#" + obj.backgroundColor.toString(16).toUpperCase();
};

// Type 10
function readDefineFont(obj, tag, ba) {
	var startPos = ba.position;
	
	var font = {};
	font.id = ba.readUI16();
	font.numGlyphs = ba.readUI16() / 2;
	font.glyphs = [];
	font.type = 'font';
	font.info = {};
	font.info.codes = [];
	font.tag = 'defineFont';
	font.dataSize = tag.contentLength - (ba.position - startPos);
	
	// Skip offset table?
	ba.seek(font.numGlyphs * 2 - 2);
	
	var i = font.numGlyphs;
	while (i--) { font.glyphs.push(readGlyph(ba)); }
	
	store(obj, font);
	
	if (typeof obj.fonts == "undefined") obj.fonts = [];
	obj.fonts.push(font);
};

// Type 11
function readDefineText(obj, tag, ba, withAlpha) {
	var id = ba.readUI16(),
		strings = [],
		txt = {
			type: "text",
			id: id,
			bounds: ba.readRect(),
			matrix: ba.readMatrix(),
			stringsRaw: strings,
			strings: [],
			colors: []
		},
		numGlyphBits = ba.readUI8(),
		numAdvBits = ba.readUI8(),
		fontId = null,
		fill = null,
		x = 0,
		y = 0,
		size = 0,
		str = null;
		
	// Get glpyhs
	do {
		var hdr = ba.readUB(8);
		if (hdr) {
			var type = hdr >> 7;
			if (type) {
				var flags = hdr & 0x0f;
				if (flags) {
					if (flags & TextStyleFlags.HAS_FONT) fontId = ba.readUI16();
					if (flags & TextStyleFlags.HAS_COLOR) fill = withAlpha ? ba.readRGBA() : ba.readRGB();
					if (flags & TextStyleFlags.HAS_XOFFSET) x = ba.readSI16();
					if (flags & TextStyleFlags.HAS_YOFFSET) y = ba.readSI16();
					if (flags & TextStyleFlags.HAS_FONT) size = ba.readUI16();
				}
				str = {
					font: obj.dictionary[fontId].id,
					fill: fill,
					x: x,
					y: y,
					size: size,
					entries: []
				};
				strings.push(str);
			} else {
				var numGlyphs = hdr & 0x7f,
					entries = str.entries;
				while (numGlyphs--) {
					var idx = ba.readUB(numGlyphBits),
						adv = ba.readSB(numAdvBits);
					entries.push({
						index: idx,
						advance: adv
					});
					x += adv;
				}
				ba.align();
			}
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
		var entries = string.entries,
			font = obj.dictionary[string.font],
			codes = font.info.codes,
			chars = [];
		for(var j = 0, entry = entries[0]; entry; entry = entries[++j]){
			var str = fromCharCode(codes[entry.index]);
			if(' ' != str || chars.length) chars.push(str);
		}
		colors[getHex(string.fill)] = string.fill;
		txt.strings.push(chars.join(''));
	}
	
	// Get just unique colors
	for (var i in colors) {
		txt.colors.push(colors[i]);
	}
	
	store(obj, txt);
	
	if (typeof obj.text == "undefined") obj.text = [];
	obj.text.push(txt);
};

// Type 13
function readDefineFontInfo(obj, tag, ba, hasLang) {
	var startPos = ba.position;
	
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
	while(i--) { font.info.codes.push(font.info.isWideCodes ? ba.readUI16() : ba.readUI8()); }
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
	snd.type = 'sound';
	snd.id = ba.readUI16();
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
	snd.type = 'sound';
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
	streams.push(obj.sounds.length - 1);
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
	var i = streams[streams.length - 1];
	
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
	img.type = 'image';
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
	if (tag.contentLength > 0) obj.password = ba.readString(tag.contentLength, true);
};

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
			type: "text",
			tag: 'defineEditText',
			id: id,
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
		
	if (txt.hasFont) txt.fontID = ba.readUI16();
	if (txt.hasFontClass) txt.fontClass = ba.readString();
	if (txt.hasFont) txt.fontHeight = ba.readUI16();
	if (txt.hasTextColor) txt.textColor = ba.readRGBA();
	if (txt.hasMaxLength) txt.maxLength = ba.readUI16();
	if (txt.hasLayout) {
		txt.align = ba.readUI8();
		txt.leftMargin = ba.readUI16();
		txt.rightMargin = ba.readUI16();
		txt.indent = ba.readUI16();
		txt.leading = ba.readSI16();
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
	spr.id = ba.readUI16();
	spr.frameCount = ba.readUI16();
	
	// Control tags
	readTags(obj, ba);
}

// Type 40 - Undocumented
function readNameCharacter(obj, tag, ba) {
	if (typeof obj.nameCharacter == "undefined") obj.nameCharacter = [];
	obj.nameCharacter.push(ba.readBytes(tag.contentLength));
};

// Type 41 - Undocumented
/*
http://www.igorcosta.org/?p=220
SWF_ProductInfo structure exists in FLEX swfs only, not FLASH 
compilationDate.time = ProductInfo.readUnsignedInt() + ProductInfo.readUnsignedInt() * (uint.MAX_VALUE + 1);  
  
struct SWF_ProductInfo { 
	UI32 Id;         // "3" 
	UI32 Edition;    // "6" 
					 // "flex_sdk_4.0.0.3342" 
	UI8 Major;       // "4." 
	UI8 Minor;       // "0." 
	UI32 BuildL;     // "0." 
	UI32 BuildH;     // "3342" 
	UI32 TimestampL; 
	UI32 TimestampH; 
}; 

*/
function readProductInfo(obj, tag, ba) {
	obj.productInfo = {};
	obj.productInfo.ID = ba.readUI32();
	obj.productInfo.edition = ba.readUI32();
	obj.productInfo.major = ba.readUI8();
	obj.productInfo.minor = ba.readUI8();
	obj.productInfo.buildL = ba.readUI32();
	obj.productInfo.buildH = ba.readUI32();
	obj.productInfo.timeStampL = ba.readUI32();
	obj.productInfo.timeStampH = ba.readUI32();
	obj.productInfo.sdk = obj.productInfo.major + '.' + obj.productInfo.minor + '.' + obj.productInfo.buildL + '.' + obj.productInfo.buildH;
	if(obj.productInfo.timeStampL != 0 && obj.productInfo.timeStampH != 0) {
		obj.productInfo.compileTimeStamp = new Date(obj.productInfo.timeStampL + obj.productInfo.timeStampH * 4294967296).toLocaleString(); // uint.MAX_VALUE + 1
	}
}

// Type 45
/*
The SoundStreamHead2 tag is identical to the SoundStreamHead tag, except it allows
different values for StreamSoundCompression and StreamSoundSize (SWF 3 file format).
*/
function readSoundStreamHead2(obj, tag, ba) {
	readSoundStreamHead(obj, tag, ba);
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
			
		ba.readUB(6); // Reserved
		
		var usesNonScalingStrokes = ba.readBool(),
			usesScalingStrokes = ba.readBool();
		ba.align();
	}
	
	var endEdgesOffset = ba.readUI32(),
		fillStyles = readFillStyleArray(ba, true, true, obj),
		lineStyles = readLineStyleArray(ba, true, withLineV2, true, obj),
		morph = {
			type: "morph",
			id: id,
			fillStyles: fillStyles,
			lineStyles: lineStyles,
			start: {
				type: "morph",
				id: id,
				bounds: startBounds,
				edges: readEdges(ba, fillStyles, lineStyles, true, withLineV2, true, obj)
			},
			end: {
				type: "morph",
				id: id,
				bounds: endBounds,
				edges: readEdges(ba, fillStyles, lineStyles, true, withLineV2, true, obj)
			}
		};
	
	convert2SVG(morph, true, true);
	convert2SVG(morph, true);
	
	morph.tag = withLineV2 ? 'defineMorphShape2' : 'defineMorphShape';
	
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
function readDefineFont2(obj, tag, ba) {
	var startPos = ba.position;
	
	var font = {};
	font.id = ba.readUI16();
	font.type = 'font';
	font.tag = 'defineFont2';
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
	font.info.name = ba.readString(ba.readUI8());
	font.info.codes = [];
	font.numGlyphs = ba.readUI16();
	font.glyphs = [];
	font.dataSize = tag.contentLength - (ba.position - startPos);
	
	var i = font.numGlyphs,
		offsets = [],
		tablesOffset = ba.position;
		
	while (i--) { offsets.push(font.info.useWideOffsets ? ba.readUI32() : ba.readUI16()); }
	ba.seek(font.info.useWideOffsets ? 4 : 2);
	
	for(var i = 0, o = offsets[0]; o; o = offsets[++i]) {
		ba.seek(tablesOffset + o, true);
		font.glyphs.push(readGlyph(ba));
	}
	
	i = font.numGlyphs;
	while (i--) { font.info.codes.push(font.info.isWideCodes ? ba.readUI16() : ba.readUI8()); };
	
	// Skip rest
	ba.seek(tag.contentLength - (ba.position - startPos));
	/*
	if(font.hasLayout) font.ascent = ba.readSI16();
	if(font.hasLayout) font.descent = ba.readSI16();
	if(font.hasLayout) font.leading = ba.readSI16();
	if(font.hasLayout) font.advanceTable = ba.readSI16(); // times numGlyphs
	if(font.hasLayout) font.boundsTable = ba.readRect(); // times numGlyphs Not used in Flash Player through version 7 (but must be present).
	if(font.hasLayout) font.kerningCount = ba.readUI16(); // Not used in Flash Player through version 7 (always set to 0 to save space).
	if(font.hasLayout) font.kerningTable = ba.readKerning(); // times kerning count Not used in Flash Player through version 7 (omit with KerningCount of 0).
	*/
	
	store(obj, font);
	
	if (typeof obj.fonts == "undefined") obj.fonts = [];
	obj.fonts.push(font);
	
	return font;
};

// Type 49 - Undocumented
function readGeneratorCommand(obj, tag, ba) {
	var cmd = {};
	cmd.version = ba.readUI32();
	cmd.info = ba.readString();
	
	if (typeof obj.genCommands == "undefined") obj.genCommands = [];
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
		trace2('readExportAssets', tag2.id, tag2.exportName, '***');
		store(obj, tag2);
	}
};

// Type 58
function readEnableDebugger(obj, tag, ba, isV2) {
	obj.isDebugger = true;
	if (isV2) ba.readUI16(); // Reserved
	if (tag.contentLength > 0) obj.debugPassword = ba.readString((tag.contentLength - (isV2 ? 2 : 0)), true);
};

// Type 60
function readDefineVideoStream(obj, tag, ba) {
	var vid = {};
	vid.type = 'video';
	vid.id = ba.readUI16();
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
	
	if(typeof obj.videos == "undefined") obj.videos = [];
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

// Type 64
function readEnableDebugger2(obj, tag, ba) {
	readEnableDebugger(obj, tag, ba, true);
};

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

// Type 74
function readCSMTextSettings(obj, tag, ba) {
	var id = ba.readUI16(),
		txt = obj.dictionary[id];
	txt.useFlashType = ba.readUB(2);
	txt.gridFit = ba.readUB(3);
	ba.readUB(3); // Reserved, always 0
	txt.thickness = ba.readFixed();
	txt.sharpness = ba.readFixed();
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
	var font = readDefineFont2(obj, tag, ba);
	font.tag = 'defineFont3';
};

// Type 76
function readSymbolClass(obj, tag, ba) {
	readExportAssets(obj, tag, ba);
};

// Type 77
function readMetadata(obj, tag, ba) {
	obj.metadata = ba.readString();
};

// Type 83
function readDefineShape4(obj, tag, ba) {
	readDefineShape(obj, tag, ba, true, true);
}

// Type 84
function readDefineMorphShape2(obj, tag, ba) {
	readDefineMorphShape(obj, tag, ba, true);
}

// Type 87
function readDefineBinaryData(obj, tag, ba) {
	var startPos = ba.position;
	var bd = {};
	bd.type = 'binary';
	bd.id = ba.readUI16();
	ba.readUI32(); // Reserved
	bd.data = ba.readBytes(tag.contentLength - (ba.position - startPos));
	
	// Is PixelBender?
	try {
		function readOPCode(ba2, bd) {
			var op = ba2.readUI8();
			switch(op) {
				case 0xA5 :
					bd.isPBJ = true;
					bd.pbVersion = ba2.readUI32(false);
					break;
				case 0xA4 :
					var len = ba2.readUI16(false);
					bd.isPBJ = true;
					bd.pbName = ba2.readString(len);
					break;
			}
		}
		
		var ba2 = new Flashbug.ByteArrayString(bd.data);
		readOPCode(ba2, bd);
		readOPCode(ba2, bd);
	} catch(e) {
		dump('readDefineBinaryData ' + e + '\n');
	}
	
	// Is SWF?
	try {
		var ba2 = new Flashbug.ByteArrayString(bd.data);
		var signature = ba2.readString(3);
		if(signature == "CWS") {
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
		if(signature == "GIF89a") bd.isGIF = true;
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
	font.id = ba.readUI16();
	font.type = 'font';
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
TAGS[-1] = {name:'Header', 				func:skipTag };

TAGS[0] = {name:'End', 					func:readEnd };
TAGS[1] = {name:'ShowFrame', 				func:skipTag };
TAGS[2] = {name:'DefineShape', 			func:readDefineShape };
// Undocumented/Unused - Release a character which won't be used in this movie anymore. SWF1
TAGS[3] = {name:'FreeCharacter', 			func:skipTag };
TAGS[4] = {name:'PlaceObject', 			func:skipTag };
TAGS[5] = {name:'RemoveObject', 			func:skipTag };
TAGS[6] = {name:'DefineBits', 			func:readDefineBits };
TAGS[7] = {name:'DefineButton', 			func:skipTag };
TAGS[8] = {name:'JPEGTables', 			func:readJPEGTables };
TAGS[9] = {name:'SetBackgroundColor', 	func:readSetBackgroundColor };

TAGS[10] = {name:'DefineFont', 			func:readDefineFont };
TAGS[11] = {name:'DefineText', 			func:readDefineText };
TAGS[12] = {name:'DoAction', 				func:skipTag };
TAGS[13] = {name:'DefineFontInfo',		func:readDefineFontInfo };
TAGS[14] = {name:'DefineSound', 		func:readDefineSound };
TAGS[15] = {name:'StartSound', 			func:skipTag };
// Undocumented/Unused - Start playing the referenced sound on the next ShowFrame. SWF2
TAGS[16] = {name:'StopSound', 				func:skipTag };
TAGS[17] = {name:'DefineButtonSound', 		func:skipTag };
TAGS[18] = {name:'SoundStreamHead', 	func:readSoundStreamHead };
TAGS[19] = {name:'SoundStreamBlock', 	func:readSoundStreamBlock };

TAGS[20] = {name:'DefineBitsLossless', func:readDefineBitsLossless };
TAGS[21] = {name:'DefineBitsJPEG2', 	func:readDefineBitsJPEG2 };
TAGS[22] = {name:'DefineShape2', 		func:readDefineShape2 };
TAGS[23] = {name:'DefineButtonCxform', 	func:skipTag };
TAGS[24] = {name:'Protect', 			func:readProtect };
// Undocumented/Unused - The shape paths are defined as in postscript? SWF3
TAGS[25] = {name:'PathsArePostscript', 	func:skipTag };
TAGS[26] = {name:'PlaceObject2', 			func:skipTag };
TAGS[27] = {name:'UNKNOWN 27', 			func:skipTag };
TAGS[28] = {name:'RemoveObject2', 			func:skipTag };
// Undocumented/Unused - Tag used to synchronize the animation with the hardware. SWF3
TAGS[29] = {name:'SyncFrame', 				func:skipTag };

TAGS[30] = {name:'UNKNOWN 30', 			func:skipTag };
// Undocumented/Unused - Probably an action that would be used to clear everything out. SWF3
TAGS[31] = {name:'FreeAll', 				func:skipTag };
TAGS[32] = {name:'DefineShape3', 		func:readDefineShape3 };
TAGS[33] = {name:'DefineText2', 		func:readDefineText2 };
TAGS[34] = {name:'DefineButton2', 			func:skipTag };
TAGS[35] = {name:'DefineBitsJPEG3', 	func:readDefineBitsJPEG3 };
TAGS[36] = {name:'DefineBitsLossless2', func:readDefineBitsLossless2 };
TAGS[37] = {name:'DefineEditText', 		func:readDefineEditText };
// Undocumented/Unused - Apparently, Macromedia did have a first attempt in supporting video on their platform. 
// It looks, however, as if they reconsidered at that point in time. SWF4
TAGS[38] = {name:'DefineVideo', 			func:skipTag };
TAGS[39] = {name:'DefineSprite', 		func:readDefineSprite };

// Undocumented/Generator - Define the name of an object (for buttons, bitmaps, sprites and sounds.) SWF3
TAGS[40] = {name:'NameCharacter', 		func:readNameCharacter };
// Undocumented 41 - This tag defines information about the product used to generate the animation. 
// The product identifier should be unique among all the products. The info includes a product identifier, 
// a product edition, a major and minor version, a build number and the date of compilation. All of this 
// information is all about the generator, not the output movie.
TAGS[41] = {name:'ProductInfo', 		func:readProductInfo };
// Undocumented/Unused - Another tag that Flash ended up not using. SWF1
TAGS[42] = {name:'DefineTextFormat', 		func:skipTag };
TAGS[43] = {name:'FrameLabel', 			func:skipTag };
// Undocumented
TAGS[44] = {name:'DefineBehavior', 		func:skipTag };
TAGS[45] = {name:'SoundStreamHead2', 	func:readSoundStreamHead2 };
TAGS[46] = {name:'DefineMorphShape', 	func:readDefineMorphShape };
// Undocumented/Unused - This may have been something similar to a New in an action script and thus was removed later. SWF3
TAGS[47] = {name:'GenerateFrame', 			func:skipTag };
TAGS[48] = {name:'DefineFont2', 		func:readDefineFont2 };
// Undocumented/Generator - Gives some information about the tool which generated this SWF file and its version. SWF3
TAGS[49] = {name:'GeneratorCommand', 	func:readGeneratorCommand };

// Undocumented - SWF5
TAGS[50] = {name:'DefineCommandObject', 	func:skipTag };
// Undocumented/Generator - It looks like this would have been some sort of DefineSprite extension... did not make it out either. SWF5
TAGS[51] = {name:'CharacterSet', 		func:readCharacterSet };
// Undocumented/Unused - It looks like accessing a system font was going to be another tag, 
// but instead Macromedia made use of a flag in the existing DefineFont2 tag. SWF5
TAGS[52] = {name:'ExternalFont', 			func:skipTag };
// Undocumented
TAGS[52] = {name:'DefineFunction', 		func:skipTag }; 
// Undocumented
TAGS[54] = {name:'PlaceFunction', 			func:skipTag };
// Undocumented
TAGS[55] = {name:'GeneratorTagObject', 	func:skipTag };
TAGS[56] = {name:'ExportAssets', 		func:readExportAssets };
TAGS[57] = {name:'ImportAssets', 			func:skipTag };
TAGS[58] = {name:'EnableDebugger', 		func:readEnableDebugger };
TAGS[59] = {name:'DoInitAction', 			func:skipTag };

TAGS[60] = {name:'DefineVideoStream', 	func:readDefineVideoStream };
TAGS[61] = {name:'VideoFrame', 			func:readVideoFrame };
TAGS[62] = {name:'DefineFontInfo2', 	func:readDefineFontInfo2 };
// Undocumented 63 - This tag is used when debugging an SWF movie. 
// It gives information about what debug file to load to match the SWF movie with the source. The identifier is a UUID. SWF6
TAGS[63] = {name:'DebugID', 				func:skipTag };
TAGS[64] = {name:'EnableDebugger2', 	func:readEnableDebugger2 };
TAGS[65] = {name:'ScriptLimits', 			func:skipTag };
TAGS[66] = {name:'SetTabIndex', 			func:skipTag };
// Undocumented
TAGS[67] = {name:'DefineShape4_', 			func:skipTag };
// Undocumented
TAGS[68] = {name:'DefineMorphShape2_', 	func:skipTag };
TAGS[69] = {name:'FileAttributes', 		func:readFileAttributes };

TAGS[70] = {name:'PlaceObject3', 			func:skipTag };
TAGS[71] = {name:'ImportAssets2', 			func:skipTag };
TAGS[72] = {name:'DoABC', 					func:skipTag };
TAGS[73] = {name:'DefineFontAlignZones', 	func:skipTag };
TAGS[74] = {name:'CSMTextSettings', 	func:readCSMTextSettings };
TAGS[75] = {name:'DefineFont3', 		func:readDefineFont3 };
TAGS[76] = {name:'SymbolClass', 		func:readSymbolClass };
TAGS[77] = {name:'Metadata', 			func:readMetadata };
TAGS[78] = {name:'DefineScalingGrid', 		func:skipTag };
TAGS[79] = {name:'UNKNOWN 79', 			func:skipTag };

TAGS[80] = {name:'UNKNOWN 80', 			func:skipTag };
TAGS[81] = {name:'UNKNOWN 81', 			func:skipTag };
TAGS[82] = {name:'DoABCDefine', 			func:skipTag };
TAGS[83] = {name:'DefineShape4', 		func:readDefineShape4 };
TAGS[84] = {name:'DefineMorphShape2', 	func:readDefineMorphShape2 };
TAGS[85] = {name:'UNKNOWN 85', 			func:skipTag };
TAGS[86] = {name:'DefineSceneAndFrameLabelData', func:skipTag };
TAGS[87] = {name:'DefineBinaryData', 	func:readDefineBinaryData };
TAGS[88] = {name:'DefineFontName', 		func:readDefineFontName };
TAGS[89] = {name:'StartSound2', 			func:skipTag };

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
	obj.frameRate = ba.readUI16() / 256;
	obj.frameCount = ba.readUI16();
	
	return ba;
};

function readTags(obj, ba) {
	if (typeof obj.tags == "undefined") obj.tags = [];
	var tag = readTagHeader(obj, ba);
	while(tag) {
		//trace2(tag.type, TAGS[tag.type].name);
		var o = TAGS[tag.type];
		if (o) {
			var f = o.func;
			var startPos = ba.position;
			//trace2(ba.position + ' - ' + TAGS[tag.type].name + ' (' + tag.type + ') - ' + tag.contentLength);
			
			// Config tag parsing
			if (
				(!config.font && (tag.type == 10 || tag.type == 13 || tag.type == 62 || tag.type == 48 || tag.type == 75 || tag.type == 73 || tag.type == 88 || tag.type == 91)) || /* Font */
				(!config.binary && tag.type == 87) || /* Binary */
				(!config.video && (tag.type == 60 || tag.type == 61)) || /* Video */
				(!config.shape && (tag.type == 2 || tag.type == 22 || tag.type == 32 || tag.type == 83)) || /* Shape */
				(!config.morph && (tag.type == 46 || tag.type == 84)) || /* Morph */
				(!config.image && (tag.type == 6 || tag.type == 8 || tag.type == 21 || tag.type == 35 || tag.type == 20 || tag.type == 36 || tag.type == 90)) || /* Image */
				(!config.sound && (tag.type == 14 || tag.type == 18 || tag.type == 45 || tag.type == 19)) || /* Sound */
				((!config.text || !config.font) && (tag.type == 11 || tag.type == 37 || tag.type == 74)) /* Text */
			) {
				f = skipTag;
			}
			
			// Read tag
			f(obj, tag, ba);
			
			// Re-align in the event a tag was read improperly
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

onmessage = function(event) {
	var ba = new Flashbug.ByteArrayString(event.data.text, Flashbug.ByteArrayString.LITTLE_ENDIAN);
	config = event.data.config;
	
	var obj = {};
	obj.dictionary = [];
	ba = readHeader(obj, ba);
	if(!ba) {
		postMessage(obj);
		return;
	}
	
	readTags(obj, ba);
	
	postMessage(obj);
};