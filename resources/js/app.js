import '../css/app.css';

import { createInertiaApp } from '@inertiajs/vue3';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';

createInertiaApp({
	title: (title) => `${title} · Chess Core`,
	resolve: (name) => {
		const pages = import.meta.glob('./Pages/**/*.vue', { eager: true });

		return pages[`./Pages/${name}.vue`];
	},
	setup({ el, App, props, plugin }) {
		createApp({ render: () => h(App, props) })
			.use(plugin)
			.use(createPinia())
			.mount(el);
	},
	progress: {
		color: '#facc15',
	},
});
