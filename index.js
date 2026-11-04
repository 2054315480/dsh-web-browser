/**
 * Host half of the built-in web-browser bundle.
 *
 * Everything this plugin contributes is Client-side: the "浏览器" view tab
 * beside 对话/轨迹 and the browser body render in the Web GUI (see
 * client.js). The Host row exists so the Loader mounts the package and
 * the client half activates.
 *
 * User preferences (the default homepage) are stored in the browser's
 * localStorage by the view itself, so no Host service is required.
 */

export function apply() {
	// No Host-side registrations; the Client module owns the rendering.
	return () => {};
}
