#!/bin/sh
#
# This can also be done on the spark command line with `--packages …` but this approach allows us to provide custom built jars if needed.
#
set -eu

V="0.2.0"
DEST="/opt/analytics/jars"

# Adjust these artifacts to the exact modules you use for bulk reader/writer on your chosen Spark/Scala.
# This is a template; pin to the precise coordinates you want.
BASE="https://downloads.apache.org/cassandra"

CASSANDRA_ANALYTICS_DOWNLOAD="${BASE}/cassandra-analytics/${V}/apache-cassandra-analytics-${V}.tar.gz"
# override for CASSANALYTICS-xxx
V="0.3-SNAPSHOT"
CASSANDRA_ANALYTICS_DOWNLOAD="https://nightlies.apache.org/cassandra/devbranch/cassandra-analytics/apache-cassandra-analytics-0.3-mck-202601172332.tar.gz"
# end-override

echo "Cleaning previous files…"
[ -z "${DEST}" ] || [ "${DEST}" = "/" ] || [ $(echo $(echo ${DEST} | sed 's:^/*::; s:/*$::; s://*:/:g') | tr '/' '\n' | grep -c '^.') -lt 3 ] && { echo "Error: DEST must have at least 3 directory components. DEST='${DEST}'" ; exit 1 ; }
set -x
mkdir -p "${DEST}"
rm -rf apache-cassandra-analytics-*.tar.gz apache-cassandra-analytics-*.tar apache-cassandra-analytics-* "${DEST}"/*


echo "Downloading Cassandra Analytics jars (version ${V}) ..."
# download, unpack, remove unneeded, move to $DEST/
curl -fsSl -o apache-cassandra-analytics-${V}.tar.gz "${CASSANDRA_ANALYTICS_DOWNLOAD}"
gunzip apache-cassandra-analytics-${V}.tar.gz
tar -xf apache-cassandra-analytics-${V}.tar
find apache-cassandra-analytics-${V}/lib/ \( -name "*-javadoc.jar" -o -name "*-sources.jar" -o -name "*-test.jar" -o -name "*-test-fixtures.jar" \) -delete
find apache-cassandra-analytics-${V}/lib/ -name "*four-zero*" -delete
find apache-cassandra-analytics-${V}/lib/ -name "*five-zero*" -delete
find apache-cassandra-analytics-${V}/lib/ -name "*integration-framework*" -delete
find apache-cassandra-analytics-${V}/lib/ -name "*integration-tests*" -delete
cp apache-cassandra-analytics-${V}/lib/*.jar "${DEST}/"

echo "Done. Contents:"
ls -lh "${DEST}/"
