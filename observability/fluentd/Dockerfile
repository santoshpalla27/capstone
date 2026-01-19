FROM fluent/fluentd:v1.16-debian

USER root

# Install Elasticsearch plugin
RUN gem install fluent-plugin-elasticsearch --no-document

USER fluent

EXPOSE 24224

CMD ["fluentd", "-c", "/fluentd/etc/fluent.conf"]
