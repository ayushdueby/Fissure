package com.fissure.Git.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@Component
public class AiService {

    @Value("${OLLAMA_BASE_URL}")
    private String ollamaBaseUrl;

    @Value("${OLLAMA_MODEL:llama3}")
    private String model;

    public String generation(String prompt) {

        try {

            String url = ollamaBaseUrl + "/api/generate";

            String escapedPrompt = prompt
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "");

            String body = """
            {
              "model": "%s",
              "prompt": "%s",
              "stream": false
            }
            """.formatted(model, escapedPrompt);

            HttpURLConnection conn =
                    (HttpURLConnection) new URL(url).openConnection();

            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes());
            }

            InputStream stream =
                    conn.getResponseCode() >= 400
                            ? conn.getErrorStream()
                            : conn.getInputStream();

            BufferedReader br =
                    new BufferedReader(new InputStreamReader(stream));

            String response =
                    br.lines().reduce("", (a, b) -> a + b);

//            System.out.println("FULL OLLAMA RESPONSE:");
//            System.out.println(response);

            ObjectMapper mapper = new ObjectMapper();

            JsonNode node = mapper.readTree(response);

            JsonNode responseNode = node.get("response");

            if (responseNode == null) {
                return "Error: " + response;
            }

            return responseNode.asText();

        } catch (Exception e) {

            e.printStackTrace();

            return "Error: " + e.getMessage();
        }
    }
}