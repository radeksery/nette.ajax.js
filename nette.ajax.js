/**
 * AJAX Nette Framework plugin for jQuery
 *
 * @copyright Copyright (c) 2009, 2010 Jan Marek
 * @copyright Copyright (c) 2009, 2010 David Grudl
 * @copyright Copyright (c) 2012-2014 Vojtěch Dobeš
 * @license MIT
 *
 * @version 2.4.1
 */

(function(window, $, undefined) {

	if (typeof $ !== 'function') {
		return console.error('nette.ajax.js: jQuery is missing, load it please');
	}

	// Inspired by https://stackoverflow.com/questions/736513/how-do-i-parse-a-url-into-hostname-and-path-in-javascript
	var getLocation = function(href) {
		var k = ['protocol', 'hostname', 'host', 'pathname', 'port', 'search', 'hash', 'href'];
		var a = document.createElement('a');

		a.href = href;

		// IE doesn't populate all link properties when setting .href with a relative URL,
		// however .href will return an absolute URL which then can be used on itself
		// to populate these additional fields.
		if (a.host === '') {
			a.href = a.href;
		}

		for (var r = {}, i = 0; i < k.length; i++) {
			r[k[i]] = a[k[i]];
		}

		// IE doesn't return the leading / in pathname
		if (r.pathname === '') {
			r.pathname = '/';
		} else if (r.pathname[0] !== '/') {
			r.pathname = '/' + r.pathname;
		}

		r.toString = function() { return a.href; };

		return r;
	};

	var nette = function () {
		var inner = {
			self: this,
			initialized: false,
			contexts: {},
			on: {
				init: {},
				load: {},
				prepare: {},
				before: {},
				start: {},
				success: {},
				complete: {},
				error: {}
			},
			fire: function () {
				var result = true;
				var args = Array.prototype.slice.call(arguments);
				var props = args.shift();
				var name = (typeof props === 'string') ? props : props.name;
				var off = (typeof props === 'object') ? props.off || {} : {};
				args.push(inner.self);
				$.each(inner.on[name], function (index, reaction) {
					if (reaction === undefined || $.inArray(index, off) !== -1) return true;
					var temp = reaction.apply(inner.contexts[index], args);
					return result = (temp === undefined || temp);
				});
				return result;
			},
			requestHandler: function (e) {
				var xhr = inner.self.ajax({}, this, e);
				if (xhr && xhr._returnFalse) { // for IE 8
					return false;
				}
			},
			ext: function (callbacks, context, name) {
				while (!name) {
					name = 'ext_' + Math.random();
					if (inner.contexts[name]) {
						name = undefined;
					}
				}

				$.each(callbacks, function (event, callback) {
					inner.on[event][name] = callback;
				});
				inner.contexts[name] = $.extend(context ? context : {}, {
					name: function () {
						return name;
					},
					ext: function (name, force) {
						var ext = inner.contexts[name];
						if (!ext && force) throw "Extension '" + this.name() + "' depends on disabled extension '" + name + "'.";
						return ext;
					}
				});
			}
		};

		/**
		 * Allows manipulation with extensions.
		 * When called with 1. argument only, it returns extension with given name.
		 * When called with 2. argument equal to false, it removes extension entirely.
		 * When called with 2. argument equal to hash of event callbacks, it adds new extension.
		 *
		 * @param  {string} name Name of extension
		 * @param  {boolean|object|null} callbacks Set of callbacks for any events OR false for removing extension.
		 * @param  {object|null}context Context for added extension
		 * @return {$.nette|object} Provides a fluent interface OR returns extensions with given name
		 */
		this.ext = function (name, callbacks, context) {
			if (typeof name === 'object') {
				inner.ext(name, callbacks);
			} else if (callbacks === undefined) {
				return inner.contexts[name];
			} else if (!callbacks) {
				$.each(['init', 'load', 'prepare', 'before', 'start', 'success', 'complete', 'error'], function (index, event) {
					inner.on[event][name] = undefined;
				});
				inner.contexts[name] = undefined;
			} else if (typeof name === 'string' && inner.contexts[name] !== undefined) {
				throw "Cannot override already registered nette-ajax extension '" + name + "'.";
			} else {
				inner.ext(callbacks, context, name);
			}
			return this;
		};

		/**
		 * Initializes the plugin:
		 * - fires 'init' event, then 'load' event
		 * - when called with any arguments, it will override default 'init' extension
		 *   with provided callbacks
		 *
		 * @param  {function|object|null} load Callback for 'load' event or entire set of callbacks for any events
		 * @param  {object|null} loadContext Context provided for callbacks in first argument
		 * @return {$.nette} Provides a fluent interface
		 */
		this.init = function (load, loadContext) {
			if (inner.initialized) throw 'Cannot initialize nette-ajax twice.';

			if (typeof load === 'function') {
				this.ext('init', null);
				this.ext('init', {
					load: load
				}, loadContext);
			} else if (typeof load === 'object') {
				this.ext('init', null);
				this.ext('init', load, loadContext);
			} else if (load !== undefined) {
				throw 'Argument of init() can be function or function-hash only.';
			}

			inner.initialized = true;

			inner.fire('init');
			this.load();
			return this;
		};

		/**
		 * Fires 'load' event
		 *
		 * @return {$.nette} Provides a fluent interface
		 */
		this.load = function () {
			inner.fire('load', inner.requestHandler);
			return this;
		};

		/**
		 * Executes AJAX request. Attaches listeners and events.
		 *
		 * @param  {object|string} settings or URL
		 * @param  {Element|null} ui ussually Anchor or Form
		 * @param  {event|null} e event causing the request
		 * @return {xhr|null}
		 */
		this.ajax = function (settings, ui, e) {
			if ($.type(settings) === 'string') {
				settings = {url: settings};
			}
			if (!settings.nette && ui && e) {
				var $el = $(ui), xhr, originalBeforeSend;
				var analyze = settings.nette = {
					e: e,
					ui: ui,
					el: $el,
					isForm: $el.is('form'),
					isSubmit: $el.is('input[type=submit]') || $el.is('button[type=submit]'),
					isImage: $el.is('input[type=image]'),
					form: null
				};

				if (analyze.isSubmit || analyze.isImage) {
					analyze.form = analyze.el.closest('form');
				} else if (analyze.isForm) {
					analyze.form = analyze.el;
				}

				if (!settings.url) {
					settings.url = analyze.form ? analyze.form.attr('action') || window.location.pathname + window.location.search : ui.href;
				}
				if (!settings.type) {
					settings.type = analyze.form ? analyze.form.attr('method') : 'get';
				}

				if ($el.is('[data-ajax-off]')) {
					var rawOff = $el.attr('data-ajax-off');
					if (rawOff.indexOf('[') === 0) {
						settings.off = $el.data('ajaxOff');
					} else if (rawOff.indexOf(',') !== -1) {
						settings.off = rawOff.split(',');
					} else if (rawOff.indexOf(' ') !== -1) {
						settings.off = rawOff.split(' ');
					} else {
						settings.off = rawOff;
					}
					if (typeof settings.off === 'string') settings.off = [settings.off];
					settings.off = $.grep($.each(settings.off, function (off) {
						return $.trim(off);
					}), function (off) {
						return off.length;
					});
				}
			}

			inner.fire({
				name: 'prepare',
				off: settings.off || {}
			}, settings);
			if (settings.prepare) {
				settings.prepare(settings);
			}

			originalBeforeSend = settings.beforeSend;
			settings.beforeSend = function (xhr, settings) {
				var result = inner.fire({
					name: 'before',
					off: settings.off || {}
				}, xhr, settings);
				if ((result || result === undefined) && originalBeforeSend) {
					result = originalBeforeSend(xhr, settings);
				}
				return result;
			};

			return this.handleXHR($.ajax(settings), settings);
		};

		/**
		 * Binds extension callbacks to existing XHR object
		 *
		 * @param  {xhr|null} xhr
		 * @param  {object} settings
		 * @return {xhr|null}
		 */
		this.handleXHR = function (xhr, settings) {
			settings = settings || {};

			if (xhr && (typeof xhr.statusText === 'undefined' || xhr.statusText !== 'canceled')) {
				xhr.done(function (payload, status, xhr) {
					inner.fire({
						name: 'success',
						off: settings.off || {}
					}, payload, status, xhr, settings);
				}).fail(function (xhr, status, error) {
					inner.fire({
						name: 'error',
						off: settings.off || {}
					}, xhr, status, error, settings);
				}).always(function (xhr, status) {
					inner.fire({
						name: 'complete',
						off: settings.off || {}
					}, xhr, status, settings);
				});
				inner.fire({
					name: 'start',
					off: settings.off || {}
				}, xhr, settings);
				if (settings.start) {
					settings.start(xhr, settings);
				}
			}
			return xhr;
		};
	};

	$.nette = new ($.extend(nette, $.nette ? $.nette : {}));

	$.fn.netteAjax = function (e, options) {
		return $.nette.ajax(options || {}, this[0], e);
	};

	$.fn.netteAjaxOff = function () {
		return this.off('.nette');
	};

	$.nette.ext('validation', {
		before: function (xhr, settings) {
			if (!settings.nette) return true;
			else var analyze = settings.nette;
			var e = analyze.e;

			var validate = $.extend(this.defaults, settings.validate || (function () {
				if (!analyze.el.is('[data-ajax-validate]')) return;
				var attr = analyze.el.data('ajaxValidate');
				if (attr === false) return {
					keys: false,
					url: false,
					form: false
				}; else if (typeof attr === 'object') return attr;
			})() || {});

			var passEvent = false;
			if (analyze.el.attr('data-ajax-pass') !== undefined) {
				passEvent = analyze.el.data('ajaxPass');
				passEvent = typeof passEvent === 'boolean' ? passEvent : true;
			}

			if (validate.keys) {
				// thx to @vrana
				var explicitNoAjax = e.button || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;

				if (analyze.form) {
					if (explicitNoAjax && analyze.isSubmit) {
						this.explicitNoAjax = true;
						return false;
					} else if (analyze.isForm && this.explicitNoAjax) {
						this.explicitNoAjax = false;
						return false;
					}
				} else if (explicitNoAjax) return false;
			}

			if (validate.form && analyze.form) {
				if (analyze.isSubmit || analyze.isImage) {
					analyze.form.get(0)["nette-submittedBy"] = analyze.el.get(0);
				}
				var notValid;
				if ((typeof Nette.version === 'undefined' || Nette.version === '2.3')) { // Nette 2.3 and older
					var ie = this.ie();
					notValid = (analyze.form.get(0).onsubmit && analyze.form.get(0).onsubmit((typeof ie !== 'undefined' && ie < 9) ? undefined : e) === false);
				} else { // Nette 2.4 and up
					notValid = ((analyze.form.get(0).onsubmit ? analyze.form.triggerHandler('submit') : Nette.validateForm(analyze.form.get(0))) === false)
				}
				if (notValid) {
					e.stopImmediatePropagation();
					e.preventDefault();
					return false;
				}
			}

			if (validate.url) {
				// thx to @vrana
				var urlToValidate = analyze.form ? settings.url : analyze.el.attr('href');
				// Check if URL is absolute
				if (/(?:^[a-z][a-z0-9+.-]*:|\/\/)/.test(urlToValidate)) {
					// Parse absolute URL
					var parsedUrl = getLocation(urlToValidate);
					if (location.pathname === parsedUrl.pathname && location.search === parsedUrl.search && parsedUrl.hash) {
						return false;
					}
				} else {
					if (/:|^#/.test(urlToValidate)) return false;
				}
			}

			if (!passEvent) {
				e.stopPropagation();
				e.preventDefault();
				xhr._returnFalse = true; // for IE 8
			}
			return true;
		}
	}, {
		defaults: {
			keys: true,
			url: true,
			form: true
		},
		explicitNoAjax: false,
		ie: function (undefined) { // http://james.padolsey.com/javascript/detect-ie-in-js-using-conditional-comments/
			var v = 3;
			var div = document.createElement('div');
			var all = div.getElementsByTagName('i');
			while (
				div.innerHTML = '<!--[if gt IE ' + (++v) + ']><i></i><![endif]-->',
					all[0]
				);
			return v > 4 ? v : undefined;
		}
	});

	$.nette.ext('forms', {
		init: function () {
			var snippets;
			if (!window.Nette || !(snippets = this.ext('snippets'))) return;

			snippets.after(function ($el) {
				$el.find('form').each(function() {
					window.Nette.initForm(this);
				});
			});
		},
		prepare: function (settings) {
			var analyze = settings.nette;
			if (!analyze || !analyze.form) return;
			var e = analyze.e;
			var originalData = settings.data || {};
			var data = {};
			var name = analyze.el.attr('name');

			if (analyze.isSubmit && name) {
				data[name] = analyze.el.val() || '';
			} else if (analyze.isImage && name) {
				var offset = analyze.el.offset();
				var dataOffset = [ Math.max(0, e.pageX - offset.left), Math.max(0, e.pageY - offset.top) ];

				if (name.indexOf('[', 0) !== -1) { // inside a container
					data[name] = dataOffset;
				} else {
					data[name + '.x'] = dataOffset[0];
					data[name + '.y'] = dataOffset[1];
				}
			}

			// https://developer.mozilla.org/en-US/docs/Web/Guide/Using_FormData_Objects#Sending_files_using_a_FormData_object
			var formMethod = analyze.form.attr('method');
			if (formMethod && formMethod.toLowerCase() === 'post' && 'FormData' in window) {
				var formData = new FormData(analyze.form[0]);
				for (var i in data) {
					formData.append(i, data[i]);
				}

				if (typeof originalData !== 'string') {
					for (var i in originalData) {
						formData.append(i, originalData[i]);
					}
				}

				// remove empty file inputs as these causes Safari 11 to stall
				// https://stackoverflow.com/questions/49672992/ajax-request-fails-when-sending-formdata-including-empty-file-input-in-safari
				if (formData.entries && navigator.userAgent.match(/version\/11(\.[0-9]*)? safari/i)) {
					// FormData must be polyfilled in IE 11 (https://github.com/jimmywarting/FormData)
					// for .. of loop is unsupported in IE 11 causing js exception, but it cannot be fixed by for .. in
					// because FormData.entries(), .keys() etc. returns Symbol iterator which is not iterable by for .. in loop
					// Symbol iterators is also unsupported in IE 11, so only option to fix it cross-browser is to convert iterator to array.
					var formDataKeys = formData.keys();
					var entries = [];
					var iterationDone = false;
					while (!iterationDone) {
						try {
							var keyItem = formDataKeys.next();
							iterationDone = keyItem.done;
							if (!iterationDone) {
								entries.push([keyItem.value, formData.get(keyItem.value)]);
							}
						} catch (error) {
							iterationDone = true
						}
					}

					for (var index in entries) {
						var pair = entries[index];
						if (pair[1] instanceof File && pair[1].name === '' && pair[1].size === 0) {
							formData.delete(pair[0]);
						}
					}
				}

				settings.data = formData;
				settings.processData = false;
				settings.contentType = false;
			} else {
				if (typeof originalData !== 'string') {
					originalData = $.param(originalData);
				}
				data = $.param(data);
				settings.data = analyze.form.serialize() + (data ? '&' + data : '') + (originalData ? '&' + originalData : '');
			}
		}
	});

	// default snippet handler
	$.nette.ext('snippets', {
		init: function () {
			this.historyExt = $.nette.ext('history');
		},
		success: function (payload, status, jqXHR, settings) {
			if (payload.snippets) {
				var requestHistory = this.historyExt && (! (settings.off && settings.off.indexOf('history') > -1));
				this.updateSnippets(payload.snippets, false, requestHistory);
			}
		}
	}, {
		beforeQueue: $.Callbacks(),
		afterQueue: $.Callbacks(),
		completeQueue: $.Callbacks(),
		before: function (callback) {
			this.beforeQueue.add(callback);
		},
		after: function (callback) {
			this.afterQueue.add(callback);
		},
		complete: function (callback) {
			this.completeQueue.add(callback);
		},
		updateSnippets: function (snippets, back, requestHistory) {
			var that = this;
			var elements = [];
			for (var i in snippets) {
				var $el = this.getElement(i);
				if ($el.get(0)) {
					elements.push($el.get(0));
				}
				this.updateSnippet($el, snippets[i], back, requestHistory);
			}
			$(elements).promise().done(function () {
				that.completeQueue.fire();
			});
		},
		updateSnippet: function ($el, html, back, requestHistory) {
			// Fix for setting document title in IE
			if ($el.is('title')) {
				// Don't change title if history is supported and enabled, see https://github.com/vojtech-dobes/nette.ajax.js/issues/151
				if (requestHistory) {
					$el[0].setAttribute('data-ajax-update', html);
				} else {
					document.title = html;
				}
			} else {
				this.beforeQueue.fire($el);
				this.applySnippet($el, html, back);
				this.afterQueue.fire($el);
			}
		},
		getElement: function (id) {
			return $('#' + this.escapeSelector(id));
		},
		applySnippet: function ($el, html, back) {
			if (!back && $el.is('[data-ajax-append]')) {
				$el.append(html);
			} else if (!back && $el.is('[data-ajax-prepend]')) {
				$el.prepend(html);
			} else if ($el.html() !== html || /<[^>]*script/.test(html)) {
				$el.html(html);
			}
		},
		escapeSelector: function (selector) {
			// thx to @uestla (https://github.com/uestla)
			return selector.replace(/[\!"#\$%&'\(\)\*\+,\.\/:;<=>\?@\[\\\]\^`\{\|\}~]/g, '\\$&');
		}
	});

	// support $this->redirect()
	$.nette.ext('redirect', {
		success: function (payload) {
			if (payload.redirect) {
				window.location.href = payload.redirect;
				return false;
			}
		}
	});

	// current page state
	$.nette.ext('state', {
		success: function (payload) {
			if (payload.state) {
				this.state = payload.state;
			}
		}
	}, {state: null});

	// abort last request if new started
	$.nette.ext('unique', {
		start: function (xhr) {
			if (this.xhr) {
				this.xhr.abort();
			}
			this.xhr = xhr;
		},
		complete: function () {
			this.xhr = null;
		}
	}, {xhr: null});

	// option to abort by ESC (thx to @vrana)
	$.nette.ext('abort', {
		init: function () {
			$('body').keydown($.proxy(function (e) {
				if (this.xhr && (e.keyCode.toString() === '27' // Esc
					&& !(e.ctrlKey || e.shiftKey || e.altKey || e.metaKey))
				) {
					this.xhr.abort();
				}
			}, this));
		},
		start: function (xhr) {
			this.xhr = xhr;
		},
		complete: function () {
			this.xhr = null;
		}
	}, {xhr: null});

	$.nette.ext('load', {
		success: function () {
			$.nette.load();
		}
	});

	// default ajaxification (can be overridden in init())
	$.nette.ext('init', {
		load: function (rh) {
			$(this.linkSelector).off('click.nette', rh).on('click.nette', rh);
			$(this.formSelector).off('submit.nette', rh).on('submit.nette', rh)
				.off('click.nette', ':image', rh).on('click.nette', ':image', rh)
				.off('click.nette', ':submit', rh).on('click.nette', ':submit', rh);
			$(this.buttonSelector).closest('form')
				.off('click.nette', this.buttonSelector, rh).on('click.nette', this.buttonSelector, rh);
		}
	}, {
		linkSelector: 'a.ajax',
		formSelector: 'form.ajax',
		buttonSelector: 'input.ajax[type="submit"], button.ajax[type="submit"], input.ajax[type="image"]'
	});

})(window, window.jQuery);
