package com.coursevector.flashbug
{

	import com.adobe.serialization.json.*;
	import flash.display.DisplayObject;
	import flash.display.DisplayObjectContainer;
	import flash.display.InteractiveObject;
	import flash.display.LoaderInfo;
	import flash.display.Sprite;
	import flash.display.Stage;
	import flash.events.Event;
	import flash.events.ContextMenuEvent;
	import flash.events.MouseEvent;
	import flash.external.ExternalInterface;
	import flash.filters.GlowFilter;
	import flash.geom.ColorTransform;
	import flash.geom.Matrix;
	import flash.system.Security;
	import flash.text.StaticText;
	import flash.text.TextField;
	import flash.ui.ContextMenu;
	import flash.ui.ContextMenuItem;
	import flash.utils.getDefinitionByName;
	import flash.utils.getQualifiedClassName;
	//import flash.sampler.*;
	import flash.utils.describeType;
	import flash.net.FileReference;
	import flash.net.FileFilter;

	import flash.events.IOErrorEvent;
	import flash.events.Event;

	import flash.utils.ByteArray;
	import flash.display.LoaderInfo;
	import flash.display.Sprite;
	import flash.display.Stage;
	import flash.events.Event;

	public class Profiler extends Sprite
	{

		private var fileName:String = '';
		private var url:String = '';
		private var fileSize:String = '';
		private var swfVersion:String = '';
		private var isDebugging:Boolean = false;
		private var id:String;
		private var traceOnce:Boolean = true;
		private var _root:Object;
		private var ba:*;

		public function Profiler()
		{
			Security.allowDomain('*');
			Security.allowInsecureDomain('*');
			addEventListener("allComplete", allCompleteHandler);
			//trace(JSON.encode(this));
			trace('Profiler Loade2d');
		}

		function deepTrace(obj : *, level:int = 0):void
		{
			var tabs:String = "";
			for (var i:int = 0; i < level; i++, tabs += "\t")
			{
			}

			for (var prop:String in obj)
			{
				trace(tabs + "[" + prop + "] -> " + obj[prop]);
				deepTrace(obj[prop], level + 1);
			}
		}

		private function trace2(...args):void
		{
			var msg:String = 'Profiler::' + args.join(' ');
			//trace(msg);
			ExternalInterface.call('console.log', msg);
		}
		//ExternalInterface.call('FBTrace.sysout', msg);

		function allCompleteHandler(event:Event):void
		{
			removeEventListener("allComplete", allCompleteHandler);

			var loaderInfo:LoaderInfo = event.target as LoaderInfo;
			trace('allCompleteHandler', loaderInfo.url);
			if (loaderInfo.loader || loaderInfo.contentType != 'application/x-shockwave-flash' || ! loaderInfo.url || loaderInfo.url.indexOf('GameClient.swf') != -1)
			{
				ba = loaderInfo.bytes;
				stage.addEventListener(MouseEvent.CLICK, function(e:Event){
				var saveFile:FileReference = new FileReference();
				saveFile.addEventListener(Event.COMPLETE, saveCompleteHandler);
				saveFile.addEventListener(IOErrorEvent.IO_ERROR, saveIOErrorHandler);
				saveFile.save(ba, 'GameClient.swf');
				});

			}


			/*var description:XML = describeType(this);
			 deepTrace(this);
			trace("Other Props:\n------------------");
			for (var i:* in this) trace(i+" :: "+this[i]);
			trace("Properties:\n------------------");
			for each (var a:XML in description.accessor) {
			var val:*;
			try {
			val = this[a.@name];
			} catch(e){ }
			trace(a.@name+" : "+a.@type + " : " + val);
			
			}
			 
			trace("\n\nMethods:\n------------------");
			for each (var m:XML in description.method) {
			trace(m.@name+" : "+m.@returnType);
			if (m.parameter != undefined) {
			trace("     arguments");
			for each (var p:XML in m.parameter) trace("               - "+p.@type);
			}
			}*/



			/*_root = loaderInfo.content.root;
			
			// Create API
			if (ExternalInterface.available) {
			ExternalInterface.addCallback('memorySnapshot', memorySnapshot);
			ExternalInterface.addCallback('startDebug', startDebug);
			ExternalInterface.addCallback('stopDebug', stopDebug);
			}
			
			_root.addEventListener(Event.ENTER_FRAME, enterFrameHandler);*/
		}

		function saveCompleteHandler(e:Event):void
		{
			trace('success', e);
		}

		function saveIOErrorHandler(e:Event):void
		{
			trace('error', e);
		}

		function enterFrameHandler(e:Event):void
		{
			if (_root == null)
			{
				return;
			}

			//pauseSampling();

			if (! id)
			{
				if (ExternalInterface.available)
				{
					ExternalInterface.call('___Flashbug_start');
				}
				return;
			}
			else if (traceOnce)
			{
				trace2('ID Received - ' + _root.loaderInfo.url);
				traceOnce = false;
			}

			// Update stats //

			//startSampling();
			//clearSamples();
		}

		function startDebug(swfID:String):void
		{
			// Without an id things get pretty broken
			if (swfID == null)
			{
				return;
			}

			isDebugging = true;
			fileName = _root.loaderInfo.url.split('/').pop();
			id = swfID;
			url = _root.loaderInfo.url;
			swfVersion = _root.loaderInfo.swfVersion;
			fileSize = int(_root.loaderInfo.bytesTotal / 100) / 10 + ' KB';
			send( { 
			command:'ready', 
			/* name, url */
			args: [
			fileName, 
			url
			]
			});

			if (ExternalInterface.available)
			{
				ExternalInterface.addCallback('send', load);
			}
		}

		function stopDebug():void
		{
			if (isDebugging)
			{
				isDebugging = false;
				id = null;
			}
		}

		function send(data:Object):void
		{
			data.id = id;
			if (ExternalInterface.available)
			{
				var str:String = JSON.encode(data);

				// Strip carriage returns
				str = str.replace(/\r/g,'∂');
				str = str.replace(/\n/g,'‰');
				// Fix external interface parsing
				//str = str.split("\\").join("%5c");
				str = escape(str);

				ExternalInterface.call('Flashbug.get', str, id);
			}
		}

		function load(str:String):void
		{
			str = unescape(str);
			// Restore carriage returns
			str = str.replace(/∂/g,'\r');
			str = str.replace(/‰/g,'\n');

			var data:Object = JSON.decode(str);
			var command:String = data.command;
			//if (this[command]) this[command](data);
			this[command].apply(this, data.args || []);
		}

		// external;
		function memorySnapshot():void
		{
			send({ 
			command:'memorySnapshot', 
			/* name, url */
			args: [
			'test'
			]
			});
		}
	}
}