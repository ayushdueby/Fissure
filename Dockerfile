FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY . .

RUN chmod +x mvnw
RUN ./mvnw clean package -DskipTests

EXPOSE 10000

CMD ["java", "-Dserver.port=10000", "-jar", "target/fissure-0.0.1-SNAPSHOT.jar"]