import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';

export default [
    {
        ignores: [
            'vendor/**',
            'node_modules/**',
            'public/**',
            'bootstrap/cache/**',
            'bootstrap/ssr/**',
            'storage/**',
            'resources/js/actions/**',
            'resources/js/routes/**',
            'resources/js/wayfinder/**',
        ],
    },
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    js.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        rules: {
            'no-empty': 'off',
            'no-undef': 'off',
            'no-unused-vars': 'off',
            'vue/multi-word-component-names': 'off',
            'vue/require-default-prop': 'off',
        },
    },
    prettier,
];