from locust import HttpUser, task, between

class OperatiumUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def view_startups(self):
        self.client.get("/api/startups?page=1&limit=20")

    @task(1)
    def view_health(self):
        self.client.get("/api/health")

    @task(2)
    def view_roles(self):
        self.client.get("/api/knowledge/roles")
