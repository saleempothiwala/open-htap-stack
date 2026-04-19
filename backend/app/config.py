import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Cassandra
    cassandra_host: str = "cassandra"
    cassandra_port: int = 9042
    cassandra_keyspace: str = "demo"

    # Trino/Presto
    trino_host: str = "localhost"
    trino_port: int = 8088
    trino_user: str = "cassandra"
    trino_catalog: str = "cassandra"
    trino_schema: str = "demo"

    # Spark Thrift Server (HiveServer2)
    spark_thrift_host: str = "localhost"
    spark_thrift_port: int = 10000

    # AI / Embeddings
    openrouter_api_key: str = ""
    openai_api_key: str = ""
    openrouter_model: str = "openai/gpt-4o-mini"

    # API
    allowed_origins: str = "*"
    log_level: str = "info"

    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()