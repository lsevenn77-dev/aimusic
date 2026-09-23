FROM python:3.12-alpine
WORKDIR /app
COPY worker.py /app/worker.py
USER 65534:65534
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["python", "/app/worker.py"]
