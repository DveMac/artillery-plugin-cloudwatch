'use strict';

var aws = require('aws-sdk'),
    cloudWatch = new aws.CloudWatch(),
    constants = {
        PLUGIN_NAME: 'cloudwatch',
        PLUGIN_PARAM_NAMESPACE: 'namespace',
        // PLUGIN_PARAM_METRICS: 'metrics',
        THE: 'The "',
        CONFIG_REQUIRED: '" plugin requires configuration under <script>.config.plugins.',
        PARAM_REQUIRED: '" parameter is required',
        PARAM_MUST_BE_STRING: '" param must have a string value',
        PARAM_MUST_HAVE_LENGTH_OF_AT_LEAST_ONE: '" param must have a length of at least one',
        PARAM_MUST_BE_ARRAY: '" param must have an array value',
        // Report Array Positions
        TIMESTAMP: 0,
        REQUEST_ID: 1,
        LATENCY: 2,
        STATUS_CODE: 3
    },
    messages = {
        pluginConfigRequired: constants.THE + constants.PLUGIN_NAME + constants.CONFIG_REQUIRED + constants.PLUGIN_NAME,
        pluginParamNamespaceRequired: constants.THE + constants.PLUGIN_PARAM_NAMESPACE + constants.PARAM_REQUIRED,
        pluginParamNamespaceMustBeString: constants.THE + constants.PLUGIN_PARAM_NAMESPACE + constants.PARAM_MUST_BE_STRING,
        pluginParamNamespaceMustHaveALengthOfAtLeastOne: constants.THE + constants.PLUGIN_PARAM_NAMESPACE + constants.PARAM_MUST_HAVE_LENGTH_OF_AT_LEAST_ONE // ,
        // pluginParamMetricsRequired: constants.THE + constants.PLUGIN_PARAM_METRICS + constants.PARAM_REQUIRED,
        // pluginParamMetricsMustBeArray: constants.THE + constants.PLUGIN_PARAM_METRICS + constants.PARAM_MUST_BE_ARRAY
    },
    impl = {
        validateConfig: function(scriptConfig) {
            // Validate that plugin config exists
            if (!(scriptConfig && scriptConfig.plugins && constants.PLUGIN_NAME in scriptConfig.plugins)) {
                throw new Error(messages.pluginConfigRequired);
            }
            // Validate NAMESPACE
            if (!(constants.PLUGIN_PARAM_NAMESPACE in scriptConfig.plugins[constants.PLUGIN_NAME])) {
                throw new Error(messages.pluginParamNamespaceRequired);
            } else if (!('string' === typeof scriptConfig.plugins[constants.PLUGIN_NAME][constants.PLUGIN_PARAM_NAMESPACE] ||
                scriptConfig.plugins[constants.PLUGIN_NAME][constants.PLUGIN_PARAM_NAMESPACE] instanceof String)) {
                throw new Error(messages.pluginParamNamespaceMustBeString);
            } else if (scriptConfig.plugins[constants.PLUGIN_NAME][constants.PLUGIN_PARAM_NAMESPACE].length === 0) {
                throw new Error(messages.pluginParamNamespaceMustHaveALengthOfAtLeastOne);
            }
            // // Validate METRICS
            // if (!(messages.PLUGIN_PARAM_METRICS in pluginConfig)) {
            //     throw new Error(messages.pluginParamMetricsRequired)
            // } else if (!Array.isArray(pluginConfig[messages.PLUGIN_PARAM_METRICS])) {
            //     throw new Error(messages.pluginParamMetricsMustBeArray);
            // }
            // for(var i = 0; pluginConfig[messages.PLUGIN_PARAM_METRICS].length; i++) {
            //     validateMetric(pluginConfig[messages.PLUGIN_PARAM_METRICS][i]);
            // }
        },
        buildCloudWatchParams: function(latency, lastLatency, latencies) {
            const result = [];
            for (let i = latency; i < lastLatency; i++) {
                result.push({
                    MetricName: 'ResultStatus-' + latencies[i][constants.STATUS_CODE],
                    Dimensions: [],
                    Timestamp: (new Date(latencies[i][constants.TIMESTAMP])).toISOString(),
                    Value: 1,
                    StorageResolution: 1,
                    Unit: 'Count'
                });
                result.push({
                    MetricName: 'ResultLatency',
                    Dimensions: [],
                    Timestamp: (new Date(latencies[i][constants.TIMESTAMP])).toISOString(),
                    Value: latencies[i][constants.LATENCY] / 1000000,
                    StorageResolution: 1,
                    Unit: 'Milliseconds'
                });
            }
            return result;
        },
        sendMetricBatch: function(namespace, params) {
            const reportError = function (err) {
                if (err) {
                    console.log('Error reporting metrics to CloudWatch via putMetricData:', err);
                }
            }, cloudWatchParams = {
                Namespace: namespace,
                MetricData: params
            };
            cloudWatch.putMetricData(cloudWatchParams, reportError);
        },
        CloudWatchPlugin: function(scriptConfig, eventEmitter) {
            const self = this;
            self.config = JSON.parse(JSON.stringify(scriptConfig.plugins[constants.PLUGIN_NAME]));
            eventEmitter.on('error', function (err) {
                impl.sendMetricBatch(self.config[constants.PLUGIN_PARAM_NAMESPACE], [
                    {
                        MetricName: err,
                        Dimensions: [],
                        Timestamp: (new Date()).toISOString(),
                        Value: 1,
                        StorageResolution: 1,
                        Unit: 'Count'
                    }
                ]);
            });
            eventEmitter.on('stats', function (report) {
                let latency = 0,
                    latencies,
                    lastLatency,
                    cloudWatchParams = [];

                if (report && report.aggregate && report.aggregate.latencies && Array.isArray(report.aggregate.latencies)) {
                    latencies = report.aggregate.latencies;
                } else if (report && report.latencies && Array.isArray(report.latencies)) {
                    latencies = report.latencies;
                } else if (report && report._entries && Array.isArray(report._entries)) {
                    latencies = report._entries;
                } else {
                    latencies = [];
                }

                while (latency < latencies.length) {
                    lastLatency = Math.min(latency + 20, latencies.length);
                    cloudWatchParams.push.apply(cloudWatchParams, impl.buildCloudWatchParams(latency, lastLatency, latencies));
                    latency += cloudWatchParams.length;
                }

                while (cloudWatchParams.length > 0) {
                    impl.sendMetricBatch(self.config[constants.PLUGIN_PARAM_NAMESPACE], cloudWatchParams.splice(0,20));
                }
                console.log('Metrics reported to CloudWatch');
            });
        }
    },
    api = {
        init: function (scriptConfig, eventEmitter) {
            impl.validateConfig(scriptConfig);
            return new impl.CloudWatchPlugin(scriptConfig, eventEmitter);
        }
    };

/**
 * Configuration:
 *  {
 *      "config": {
 *          "plugins": {
 *              "cloudwatch": {
 *                  "namespace": "[INSERT_NAMESPACE]",
 // *                  "metrics": [
 // *                      {
 // *                          "name": "[METRIC_NAME]",
 // *                          "dimensions": [...],
 // *
 // *                      }
 // *                  ]
 *              }
 *          }
 *      }
 *  }
 */
module.exports = api.init;

/* test-code */
module.exports.constants = constants;
module.exports.messages = messages;
module.exports.impl = impl;
module.exports.api = api;
/* end-test-code */
