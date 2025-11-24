# Base image
FROM maven:3.8.6-openjdk-11 AS compiler
# Copy encryption source
WORKDIR /app/cdoc_jar
COPY cdoc/cdoc_jar/pom.xml pom.xml
COPY cdoc/cdoc_jar/src src
COPY .git .git

# Package project to jar
RUN mvn package


FROM openjdk:11.0.11-jre-slim

WORKDIR /app

COPY --from=compiler /app/cdoc_jar/target/cdoc.jar .

CMD ["java", "-jar", "/app/cdoc.jar"]