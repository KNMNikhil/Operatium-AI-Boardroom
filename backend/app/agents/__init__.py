from app.agents.executives.ceo import CEO
from app.agents.executives.cto import CTO
from app.agents.executives.product_manager import ProductManager
from app.agents.executives.product_designer import ProductDesigner
from app.agents.executives.growth_marketing import GrowthMarketing
from app.agents.executives.finance_operations import FinanceOperations
from app.agents.executives.investor_risk import InvestorRiskAdvisor
from app.agents.base_executive import BaseExecutive

EXECUTIVE_REGISTRY: dict[str, BaseExecutive] = {
    "CEO": CEO(),
    "CTO": CTO(),
    "Product Manager": ProductManager(),
    "Product Designer": ProductDesigner(),
    "Growth & Marketing": GrowthMarketing(),
    "Finance & Operations": FinanceOperations(),
    "Investor & Risk Advisor": InvestorRiskAdvisor(),
}

def get_executive(role: str) -> BaseExecutive | None:
    return EXECUTIVE_REGISTRY.get(role)

def get_executives(roles: list[str]) -> dict[str, BaseExecutive]:
    return {role: EXECUTIVE_REGISTRY[role] for role in roles if role in EXECUTIVE_REGISTRY}
