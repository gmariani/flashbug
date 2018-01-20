package com.coursevector.flashbug {
	
	import flash.display.Bitmap;
	import flash.display.BitmapData;
	import flash.display.DisplayObject;
	import flash.display.MovieClip;
	import flash.display.Stage;
	import flash.geom.ColorTransform;
	import flash.geom.Matrix;
	
	public class Overlay extends MovieClip {
		
		public var target:DisplayObject;
		private var bmp:Bitmap;
		
		public function Overlay() { }
		
		public function update(stage:Stage):void {
			while (this.numChildren) {
				this.removeChildAt(0);
			}
			
			if (stage.stageHeight > 0 && stage.stageWidth > 0) {
				bmp = new Bitmap(new BitmapData(stage.stageWidth, stage.stageHeight, true, 0), 'auto', true);
				this.addChild(bmp);
			}
			
			this.refresh();
		}
		
		public function clear():void {
			bmp.bitmapData.fillRect(bmp.bitmapData.rect, 0);
		}
		
		public function refresh():void {
			if (this.target) {
				var ctx:ColorTransform = this.target.transform.colorTransform;
				var mtx:Matrix = getMatrix(this.target);
				ctx.color = 10475759;
				bmp.bitmapData.draw(this.target, mtx, ctx, null, null, true);
			}
		}
		
		private function getMatrix(target:DisplayObject):Matrix {
			var mtx:Matrix = new Matrix();
			while (target) {
				try {
					mtx.concat(target.transform.matrix.clone());
				} catch (e:Error) { }
				target = target.parent as DisplayObject;
			}
			return mtx;
		}
	}
}