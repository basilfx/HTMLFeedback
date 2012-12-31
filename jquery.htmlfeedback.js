/**
 * HTMLFeedback
 *
 * Copyright (c) 2012 Bas Stottelaar
 * See the file LICENSE for copying permission.
 *
 * jQuery based plugin to mark areas of your website that needs attention.
 * With the help of HTML2Canvas, we can create a screenshot (including the marked
 * areas) and upload it to the server. It currently is compatible with browsers 
 * supporting the canvas element. You can disable the canvas element as an overlay
 * and use FlashCanvas to render the screen.
 *
 * @author Bas Stottelaar <http://github.com/basilfx>
 * @version 1.0
 * @date 2012-02-18 (last update: 2012-12-30)
 * @license MIT
 */
(function($) {
	/**
     * @var object Reference to the BlobBuilder, if the browser supports
     * it. If not, this variable will be undefined.
     */
	var BlobBuilder = window.BlobBuilder || window.MozBlobBuilder || window.WebKitBlobBuilder || window.MSBlobBuilder || undefined;

	/**
	 * @var object Reference to the FormData, if the browser supports it.
	 * If not, this variable will be undefined.
	 */
	var FormData = window.FormData || undefined;

	/**
	 * @var boolean True when the webpage is shown on a touch compatible device.
	 */
	var isTouchDevice = "ontouchstart" in document.documentElement;

	/**
	 * Convert a data URI to a blob.
	 * @see http://stackoverflow.com/questions/4998908/convert-data-uri-to-file-then-append-to-formdata
	 * @return Blob Object containing the dataURI.
	 */
	function dataURItoBlob(dataURI, callback) {
        var byteString = atob(dataURI.split(",")[1]);
        var mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

        var ab = new ArrayBuffer(byteString.length);
        var ia = new Uint8Array(ab);

        for (var i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }

        var bb = new BlobBuilder();
        bb.append(ab);
        return bb.getBlob(mimeString);
    }

	/**
	 * Translate a touch event into a mouse event. Handles only
	 * single touches.
	 * @param event Event object containing the touch.
	 */
	function touchToMouseEvent(event) {
		// Only single touches
		if (event.originalEvent.touches.length > 1) return;

		// Set data
		var touch = event.originalEvent.changedTouches[0];
        var newEvent = document.createEvent('MouseEvents');
        var type = null;
        var simulateClick = false;

        // Determine type
		switch(event.type) {
        	case "touchstart":
        		type = "mousedown";
        		break;
        	case "touchmove":
        		type = "mousemove";
        		break;
        	case "touchend":
        		type = "mouseup";
        		break;
        	default:
        		return;
    	}

    	// Handle click events
    	if (event.type == "touchstart") {
    		event.target.startX = touch.clientX;
    		event.target.startY = touch.clientY;
    	} else if (event.type == "touchend") {
    		simulateClick = Math.abs(event.target.startX - touch.clientX) < 10 ||
    						Math.abs(event.target.startY - touch.clientY) < 10;

    		if (simulateClick) type = "click";
    	}

        // Initialize event
	    newEvent.initMouseEvent(
	    	type, true, true, window, 1,
	    	touch.screenX, touch.screenY,
	    	touch.clientX, touch.clientY, false,
	    	false, false, false, 0, null
	    );

	    // Done
	    event.target.dispatchEvent(newEvent);
	    event.preventDefault();
	}

	/**
	 * Detect support for the canvas element.
	 * @return true if canvas element is supported
	 */
	function isCanvasSupported() {
		var elem = document.createElement("canvas");
		return !!(elem.getContext && elem.getContext("2d"));
	}

	/**
	 * Calculate the Eucledian distance from elements boundings
	 * @param element jQuery element
	 * @return double Pythagoras distance
	 */
	function distance(element) {
		var x = (element.position().left + element.width()) - element.position().left;
		var y = (element.position().top + element.height()) - element.position().top;

		return Math.sqrt(x*x + y*y);
	}

	/**
	 * @var object CSS for overlay and markers
	 */
	var css = {
		// CSS for the overlay and rectangles container
		base: {
			"position": "absolute",
			"top": 0,
			"left": 0,
			"margin": 0,
			"z-index": 4900
		},

		// CSS for the rectangles container
		markers: {
			"z-index": 5000,
            "background-color": "rgba(0,0,0,0)"
		},

		// CSS for the rectangles drawn
		rectangle: {
			"position": "absolute",
			"font-size": "14px",
			"font-weight": "bold",
			"z-index": 5500,
			"border": "2px solid #000"
		},

		// CSS to make everything unselectable
		unselectable: {
			"-moz-user-select": "-moz-none",
			"-khtml-user-select": "none",
			"-webkit-user-select": "none",
			"user-select": "none"
		}
	}

	/**
	 * @var object The 'almighty' HTMLFeedback object
	 */
	var HTMLFeedback = {}

	/**
	 * @var object List of all HTMLFeedback instances
	 */
	HTMLFeedback.instances = {};

	/**
	 * @var object Default plugin options
	 */
	HTMLFeedback.defaults = {
        /**
	     * @var boolean If true, upload the data as URI instead as a multipart
	     * file. Default is false if browser has support for BlobBuilder.
	     */
        uploadAsURI: (BlobBuilder ? false : true),

        /**
         * @var boolean If true, use the canvas element as overlay for
         * the screen. Default is true if the browser has support for the
         * canvas element.
         */
        useCanvas: isCanvasSupported(),

        /**
         * @var int Minimal distance for a drawn square. Small nummer
         * allows small squares. Please note: on touch devices the number
         * will be at least 10px.
         */
        minimalDistance: 10,

        /**
         * @var object Rectangle color (in RGBA for opacity)
         */
        color: "rgba(255,255,255,0)",

        /**
         * @var element Reference to a container object where the canvas
         * and markers will be drawn over. Defaults to document.
         */
        container: $(document),

        /**
         * @var string Name of the element for file uploading.
         */
        uploadName: 'screenshot',

        /**
         * @var string Mime type of the file
         */
        uploadMIME: 'image/png',

        /**
         * @var callback Before a rectangle has been drawn
         */
        onRectangleStart: function(rectangle, x, y) {},

        /**
         * @var callback After a rectangle has been drawn
         */
        onRectangleEnd: function(rectangle, x, y) {
        	rectangle.mouseover(function(e) {
				rectangle.text("Click me to remove");
			});

			rectangle.mouseout(function(e) {
				rectangle.text("");
			});
        },

        /**
         * @var callback Before redering has started
         */
        onPreRender: function() {
        	alert("HTMLFeedback will now create a screenshot of the web elements " +
        		  "ONLY. The overlay and feedback window will hide for a second " +
        		  "and will then show again. Rendering can take a few seconds.");
        },

        /**
         * @var callback After rendering has completed
         */
        onPostRender: function(canvas) {},

        /**
         * @var callback Show event
         */
        onShow: function() {},

        /**
         * @var callback Hide event
         */
        onHide: function() {}
    }

	/**
	 * (Re)draw the canvas element and the markers.
	 * @param instance HTMLFeedback object instance
	 */
	HTMLFeedback.paint = function(instance) {
		// Draw overlay
		if (instance.options.useCanvas) {
	        // Get context
			var context = instance.overlay[0].getContext("2d");

		    // Draw basic background
			context.clearRect(0, 0, instance.overlay.width(), instance.overlay.height());
			context.fillStyle = "rgba(0, 0, 0, 0.5)";
			context.fillRect(0, 0, instance.overlay.width(), instance.overlay.height());
		}

        // Draw rectangles
		instance.markers.find("div").each(function() {
			var element = $(this);
			var borderWidth = parseInt(element.css("border-left-width"), 10);

			// Make cutout in canvas
			if (instance.options.useCanvas) {
				context.clearRect(
					element.position().left,
					element.position().top,
					element.width() + borderWidth * 2,
					element.height() + borderWidth * 2
				);
			}
		});
	}

	/**
	 * Resize the overlay and markers container.
	 * @param instance HTMLFeedback object instance
	 */
	HTMLFeedback.resize = function(instance) {
		// Resize overlay
    	if (instance.options.useCanvas) {
    		instance.overlay.prop("width", instance.options.container.width());
			instance.overlay.prop("height", instance.options.container.height());
    	}

    	// Resize markers
    	instance.markers.width(instance.options.container.width());
		instance.markers.height(instance.options.container.height());
    }

	/**
	 * Clear all rectangles and redraw everything
	 * @param instance HTMLFeedback object instance
	 */
	HTMLFeedback.clear = function(instance) {
		instance.markers.html();
		HTMLFeedback.paint(instance);
	}

	/**
	 * Show the HTMLFeedback overlay and markers. Calls the onShow callback.
	 * @param instance HTMLFeedback object instance
	 */
	HTMLFeedback.show = function(instance) {
		if (instance.options.useCanvas) instance.overlay.show();
    	instance.markers.show();

    	instance.options.onShow();
	}

	/**
	 * Hide the HTMLFeedback overlay and markers. Calls the onHide callback.
	 * @param instance HTMLFeedback object instance
	 */
	HTMLFeedback.hide = function(instance) {
		if (instance.options.useCanvas) instance.overlay.hide();
    	instance.markers.hide();

    	instance.options.onHide();
	}

	/**
	 * Quick helper to hide or show the overlay and markers
	 * @param instance HTMLFeedback object instance
	 */
	HTMLFeedback.toggle = function(instance) {
		if (instance.markers.is(":visible")) {
			HTMLFeedback.hide(instance);
		} else {
			HTMLFeedback.show(instance);
		}
	}

	/**
	 * Render the screenshot and call the onPostRender callback with the
	 * rendered canvas element as first parameter
	 *
	 * @param instance HTMLFeedback object instance
	 */
	HTMLFeedback.render = function(instance) {
		if (instance.options.useCanvas) instance.overlay.hide();
		instance.options.onPreRender();

		html2canvas(instance.element, {
    		onrendered: function(canvas) {
    			instance.options.onPostRender(canvas)

    			// Show overlay again
				if (instance.options.useCanvas) instance.overlay.show();
    		}
  		});
	}

	/**
	 * Create screenshot and upload it via AJAX. The extra parameter is passed
	 * to the jQuery.ajax method.
	 *
	 * @param instance HTMLFeedback object instance
	 * @param extra jQuery AJAX parameters
	 * @see http://api.jquery.com/jQuery.ajax/
	 */
	HTMLFeedback.upload = function(instance, extra) {
		var imageData = null;
		var imageMime = instance.options.uploadMime;
		var uploadName = instance.options.uploadName;

		if (instance.options.useCanvas) instance.overlay.hide();
		instance.options.onPreRender();

		// Upload via XHR2
		html2canvas(instance.element, {
    		onrendered: function(canvas) {
    			instance.options.onPostRender(canvas)

    			// Create the data
    			if (instance.options.uploadAsURI) { // As 'raw' string
		            imageData = canvas.toDataURL(imageMime)
		        } else {
		            if (canvas.toBlob ? true : false) { // Native
		                canvas.toBlob(function(blob) {
		                    imageData = blob;
		                }, imageMime);
		            } else { // Via dataURI -> Blob
		                imageData = dataURItoBlob(canvas.toDataURL(imageMime));
		            }
		        }

				if (FormData) { // Prefer upload via FormData object
					var form = new FormData();
					form.append(uploadName, imageData);
					$.each(extra.data || {}, function(key, value) {
						form.append(key, value);
					});

					extra.data = form;
				} else { // Or the old-fashioned way
					extra.data = extra.data || {};
					extra.data[uploadName] = imageData;
				}

				// And upload via ajax
				$.ajax($.extend({
                	cache: false,
                	contentType: false,
                	processData: false,
				    type: 'POST'
               	}, extra));

				// Show overlay again
				if (instance.options.useCanvas) instance.overlay.show();
			}
		});
	}

	/**
	 * Initialize a new HTMLFeedback instance.
	 * @param element jQuery object to bind to
	 * @param option Plugin options.
	 * @see HTMLFeedback.defaults
	 */
	HTMLFeedback.init = function(element, options) {
		var options = $.extend(HTMLFeedback.defaults, options);

		// Create required elements and add them to the element
		var overlay = options.useCanvas ? $("<canvas />").css(css.base).css(css.unselectable).appendTo(element) : null;
		var markers = $("<div />").css(css.base).css(css.markers).css(css.unselectable).appendTo(element);

        // Create an instance
        var instance = HTMLFeedback.instances[element] = {
        	overlay: overlay,
        	markers: markers,
        	options: options,
        	element: element
        };

        var rectangle = null;

        // Attach the resize hook to the window
		$(window).resize(function() {
			HTMLFeedback.resize(instance);
			HTMLFeedback.paint(instance);
		});

		markers.mousedown(function(e) {
			rectangle = $("<div />").css({
				"left" : e.pageX,
				"top" : e.pageY
			}).css($.extend(
				css.rectangle,
				css.unselectable,
				{ "background-color": instance.options.color }
			));
            //alert(instance.options.color);

			var rectangleLeft = e.pageX;
			var rectangleTop = e.pageY;

			// Execute callback
			instance.options.onRectangleStart(
				rectangle,
				rectangleLeft,
				rectangleTop
			);

			// Add it to the DOM
			rectangle.appendTo(markers)

			markers.mousemove(function(e) {
				rectangle.width(Math.abs(e.pageX - rectangleLeft));
				rectangle.height(Math.abs(e.pageY - rectangleTop));

				if(e.pageX < rectangleLeft) {
					rectangle.css("left", e.pageX);
				}

				if(e.pageY < rectangleTop) {
					rectangle.css("top", e.pageY);
				}
			});
		});

		markers.mouseup(function(e) {
			var self = rectangle;

			var remove = (function() {
				self.remove();
				HTMLFeedback.paint(instance);
			});

			// Ignore small rectangles
			if (distance(self) < options.minimalDistance) {
				remove();
			} else {
				instance.options.onRectangleEnd(self, e.pageX, e.pageY);
				self.mousedown(function() { return false; });
				self.click(remove);
			}

			markers.unbind("mousemove");
			HTMLFeedback.paint(instance);
		});

		// Map touch events
		if (isTouchDevice) {
			instance.markers.bind("touchstart", touchToMouseEvent);
		    instance.markers.bind("touchmove", touchToMouseEvent);
		    instance.markers.bind("touchend", touchToMouseEvent);
		    instance.markers.bind("touchcancel", touchToMouseEvent);
		}

		// Initialize
		HTMLFeedback.hide(instance);
		HTMLFeedback.resize(instance);
		HTMLFeedback.clear(instance);
	};

	/**
	 * Bind the plugin to the jQuery prototype object.
	 *
	 * Once a instance has been initialized, you can execute commands on the
	 * instance. Instead of passing options, you can pass a string. For example:
	 *
	 *   $("body").htmlfeedback("upload", ajaxRequest);
	 *
	 * Supported actions:
	 *
	 *   show       --      Show the overlay and markers.
	 *   hide       --      Hide the overlay and markers.
	 *   toggle     --      Hide or show the overlay and the markers.
	 *   render     --      Create a screenshot and call the onPostRender callback
	 *                      with a reference to the newly created canvas.
	 *   upload     --      Upload a screenshot. Second parameter is a normal
	 *                      AJAX request object.
	 *   reset      --      Reset HTMLFeedback. Clears all markers.
	 *   color      --      Set the marker color.
	 */
    $.fn.htmlfeedback = function(input, extra){
		var type = typeof input;
		var self = $(this);

		if (arguments.length == 0 || type == "object") {
			HTMLFeedback.init(self, input);
		} else if (type == "string") {
			var instance = HTMLFeedback.instances[self];

			switch (input.toLowerCase()) {
				case "show":
					HTMLFeedback.show(instance);
					break;
				case "hide":
					HTMLFeedback.hide(instance);
					break;
				case "toggle":
					HTMLFeedback.toggle(instance);
					break;
				case "render":
					HTMLFeedback.render(instance, extra);
					break;
				case "upload":
					HTMLFeedback.upload(instance, extra);
					break;
				case "reset":
					HTMLFeedback.hide(instance);
					HTMLFeedback.resize(instance);
					HTMLFeedback.clear(instance);
					break;
				case "color":
					instance.options.color = extra;
					break;
			}

			return self;
		}
    }
})(jQuery);