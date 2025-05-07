(function (global) {
  'use strict';
  /**
   * Deep-merge two objects (source into target).
   * Arrays and plain objects are merged recursively; primitives and functions are overwritten.
   */
  function deepMerge(target, source) {
    if (Array.isArray(target) && Array.isArray(source)) {
      return source; // replace arrays entirely
    } else if (isObject(target) && isObject(source)) {
      const result = { ...target };
      Object.keys(source).forEach((key) => {
        if (key in target) {
          result[key] = deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      });
      return result;
    }
    return source;
  }

  function isObject(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
  }

  /**
   * Fetch JSON with a timeout.
   * @param {string} url
   * @param {number} timeoutMs
   * @returns {Promise<object>}
   */
  async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Inject a <meta> tag into <head>.
   * @param {string} name
   * @param {object} config
   */
  function injectMeta(name, config) {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = JSON.stringify(config);
    document.head.appendChild(meta);
  }

  /**
   * Inject a <link rel="stylesheet"> for each CSS file.
   * @param {string[]} urls
   */
  function injectCss(urls, assetHost) {
    urls.forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetHost + href;
      link.onerror = () => console.error(`[MomentsApp] CSS load failed: ${href}`);
      document.head.appendChild(link);
    });
  }

  /**
   * Inject <script> tags sequentially, waiting for each to load.
   * @param {string[]} urls
   * @returns {Promise<void>}
   */
  function injectJs(urls, assetHost) {
    return urls.reduce((prev, src) => {
      return prev.then(
        () =>
          new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = assetHost + src;
            // script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Script load error: ${src}`));
            document.body.appendChild(script);
          }),
      );
    }, Promise.resolve());
  }

  /**
   * Initialize and load the Moments Ember app assets.
   * @param {object} [opts]
   * @param {string} [opts.environmentUrl]        — endpoint returning { environment, version, cssFiles, jsFiles }
   * @param {string} [opts.metaTagName]           — name for the Ember meta tag
   * @param {object} [opts.metaConfigOverrides]   — partial overrides for the environment config
   * @param {number} [opts.fetchTimeout]          — ms before aborting the fetch
   * @param {function} [opts.callback]            — called once all assets are loaded
   * @returns {Promise<void>}
   */
  global.initJebbitMoments = async function (opts = {}) {
    const defaults = {
      environmentUrl: 'https://api.jebbit.io/environment',
      metaTagName: 'moments/config/environment',
      metaConfigOverrides: {},
      fetchTimeout: 15000,
      callback: null,
      assetHost: opts.assetHost || 'https://dovgpmbtext1d.cloudfront.net/',
    };
    const configOpts = deepMerge(defaults, opts);

    try {
      // 1. Fetch environment + assets
      let { environment, cssFiles, jsFiles, path } = await fetchWithTimeout(
        configOpts.environmentUrl,
        configOpts.fetchTimeout,
      );

      // 1a. If using v2, override jsFiles
      if (opts.version === 'v2') {
        jsFiles = [path];
      }
      // 1b. If jsFiles explicitly provided, use those
      if (opts.jsFiles) {
        jsFiles = opts.jsFiles;
      }

      // 1c. Ensure the vendor bundle loads first
      const vendorIdx = jsFiles.findIndex(src => {
        const fname = src.split('/').pop();
        return fname.startsWith('vendor.');
      });
      if (vendorIdx > -1) {
        const [vendorFile] = jsFiles.splice(vendorIdx, 1);
        jsFiles.unshift(vendorFile);
      }

      // 2. Parse default Ember config
      const defaultEnv = JSON.parse(environment);

      // 3. Merge overrides
      const finalEnv = deepMerge(defaultEnv, { ...configOpts.metaConfigOverrides, locationType: 'none' });

      // 4. Inject meta, CSS, then JS
      injectMeta(configOpts.metaTagName, finalEnv);
      injectCss(cssFiles, configOpts.assetHost);
      await injectJs(jsFiles, configOpts.assetHost);

      // 5. Invoke callback (if provided)
      if (typeof configOpts.callback === 'function') {
        configOpts.callback();
      }
    } catch (err) {
      console.error('[MomentsApp] Initialization error:', err);
    }
  };
})(window);
