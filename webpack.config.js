const { join } = require('path')
const { DefinePlugin } = require('webpack')
const slsw = require('serverless-webpack')
const env = require('./.env.json')
const nodeExternals = require('webpack-node-externals')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

module.exports = {
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  entry: slsw.lib.entries,
  // externals: [nodeExternals()],
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
  },
  output: {
    libraryTarget: 'commonjs2',
    path: join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  target: 'node',
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
    ],
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin(),
    new DefinePlugin(
      Object.entries(env).reduce((definitions, [key, value]) => {
        definitions[`process.env.${key}`] = JSON.stringify(value)
        return definitions
      }, {})
    ),
  ],
}
