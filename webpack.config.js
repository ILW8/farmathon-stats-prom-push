// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');


module.exports = {
    entry: './src/index.js', // Entry file
    output: {
        filename: 'bundle.js', // Output file
        path: path.resolve(__dirname, 'dist'), // Output directory
    },
    mode: 'development', // Mode: development or production
    module: {
        rules: [
            {
                test: /\.js$/, // Process JavaScript files
                exclude: /node_modules/, // Ignore node_modules
                use: {
                    loader: 'babel-loader', // Use Babel for transpiling JS
                },
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.html', // HTML template
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'src/metadata.txt', to: '.' },
                { from: 'src/settings.json', to: '.' },
            ],
        }),
    ],
};
