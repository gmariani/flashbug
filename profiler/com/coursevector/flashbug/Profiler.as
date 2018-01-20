package com.coursevector.flashbug {
	
	import flash.external.ExternalInterface;
	//import flash.sampler.*;
	import flash.utils.describeType;
	import flash.net.FileReference;
	import flash.utils.ByteArray;
	import flash.display.LoaderInfo;
	import flash.display.Sprite;
	import flash.display.Stage;
	import flash.events.*;
	import flash.net.URLRequest;
	import flash.display.Loader;
	import flash.events.Event;
	import flash.events.ProgressEvent;
	import flash.system.Security;

	public class Profiler extends Sprite {
		private var ba1:*;
		private var ba2:*;
		private var url:String = 'https://ecl.popcapsf.com/facebook/pvzadventures/GameClient.8c6117c401a77c3e2a09b82bd726087c.swf';
		
		public function Profiler():void {
			Security.allowDomain('*');
			Security.allowInsecureDomain('*');
		
			addEventListener("allComplete", allComplete);
		}
		
		function clickHandler2(e:MouseEvent):void {
			var f:FileReference = new FileReference();
			f.addEventListener(Event.COMPLETE, eventHandler);
			f.addEventListener(IOErrorEvent.IO_ERROR, eventHandler);
			f.save(ba2, 'GameClient2.swf');
		}
		
		private function allComplete(e:Event):void {
			removeEventListener("allComplete", allComplete);

			var info:LoaderInfo = e.target as LoaderInfo;
			trace(info.url, "is being monitored2");

			// now let the fun begin! try:
			// info.content
			// info.content.stage
			// info.parameters
			// info.applicationDomain
			// info.bytes

			
			//ba2 = info.bytes;
			//info.content.root.addEventListener(MouseEvent.CLICK, clickHandler2);
		}

		private function eventHandler(e:Event):void {
			trace(e);
		}
	}
}