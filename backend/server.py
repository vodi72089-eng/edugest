from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import bcrypt
import jwt as pyjwt
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr

# ------------- Setup -------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

app = FastAPI(title="EduGest Destock API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("edugest")
logging.basicConfig(level=logging.INFO)


# ------------- Utils -------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str, school_id: Optional[str] = None) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "school_id": school_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> Dict[str, Any]:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


def require_roles(*roles):
    async def _dep(user: Dict[str, Any] = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Accès refusé")
        return user
    return _dep


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 3600,
        path="/",
    )


# ------------- Models -------------
class RegisterSchoolIn(BaseModel):
    school_name: str
    admin_name: str
    email: EmailStr
    password: str
    city: Optional[str] = ""
    region: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ParentLoginIn(BaseModel):
    school_id: str
    username: str
    password: str


class SchoolCreateIn(BaseModel):
    name: str
    city: Optional[str] = ""
    region: Optional[str] = ""
    logo_url: Optional[str] = ""


class StudentIn(BaseModel):
    first_name: str
    last_name: str
    class_name: str
    matricule: Optional[str] = ""
    date_of_birth: Optional[str] = ""
    parent_username: Optional[str] = ""
    parent_password: Optional[str] = ""
    parent_contact: Optional[str] = ""


class ClassIn(BaseModel):
    name: str
    level: Optional[str] = ""


class ImportPayload(BaseModel):
    students: List[Dict[str, Any]] = []
    classes: List[Dict[str, Any]] = []


class QRTokenIn(BaseModel):
    duration_hours: int = 24  # 24, 168 (7d), 720 (30d), or custom


class ParentLookupIn(BaseModel):
    token: str
    class_name: str
    student_name: str


class BulletinIn(BaseModel):
    student_id: str
    class_name: str
    student_name: str
    term: str
    year: str
    grades: List[Dict[str, Any]]
    average: float
    rank: Optional[str] = ""
    appreciation: Optional[str] = ""


class MedicalReceiptIn(BaseModel):
    student_id: Optional[str] = ""
    student_name: str
    class_name: Optional[str] = ""
    reason: str
    treatment: str
    medic_name: str
    clearance: str  # apte / repos / hospitalisation
    amount: Optional[float] = 0.0
    currency: Optional[str] = "FCFA"


class ParentCredsIn(BaseModel):
    student_id: str
    username: str
    password: str


# ------------- Health -------------
@api.get("/")
async def root():
    return {"message": "EduGest Destock API", "time": now_iso()}


# ------------- Auth -------------
@api.post("/auth/register-school")
async def register_school(payload: RegisterSchoolIn, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Un compte avec cet email existe déjà")

    school_id = str(uuid.uuid4())
    await db.schools.insert_one({
        "id": school_id,
        "name": payload.school_name,
        "city": payload.city,
        "region": payload.region,
        "logo_url": "",
        "code": school_id[:8].upper(),
        "created_at": now_iso(),
        "active": True,
    })

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.admin_name,
        "role": "SCHOOL_ADMIN",
        "school_id": school_id,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)

    token = create_access_token(user_id, email, "SCHOOL_ADMIN", school_id)
    set_auth_cookie(response, token)
    return {"user": {"id": user_id, "email": email, "name": payload.admin_name, "role": "SCHOOL_ADMIN", "school_id": school_id}, "school_id": school_id, "token": token}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = create_access_token(user["id"], email, user["role"], user.get("school_id"))
    set_auth_cookie(response, token)
    return {
        "user": {"id": user["id"], "email": email, "name": user.get("name", ""), "role": user["role"], "school_id": user.get("school_id")},
        "token": token,
    }


@api.post("/auth/parent-login")
async def parent_login(payload: ParentLoginIn, response: Response):
    student = await db.students.find_one({
        "school_id": payload.school_id,
        "parent_username": payload.username,
    })
    if not student or not student.get("parent_password_hash"):
        raise HTTPException(status_code=401, detail="Identifiants parent invalides")
    if not verify_password(payload.password, student["parent_password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiants parent invalides")
    parent_id = f"parent:{student['id']}"
    token = create_access_token(parent_id, payload.username, "PARENT", payload.school_id)
    set_auth_cookie(response, token)
    return {
        "user": {"id": parent_id, "name": student.get("parent_username"), "role": "PARENT", "school_id": payload.school_id, "student_id": student["id"]},
        "student": {k: student.get(k) for k in ["id", "first_name", "last_name", "class_name", "matricule"]},
        "token": token,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": user}


# ------------- Schools (public search) -------------
@api.get("/schools/search")
async def search_schools(q: str = ""):
    query: Dict[str, Any] = {"active": True}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
            {"region": {"$regex": q, "$options": "i"}},
            {"code": q.upper()},
        ]
    schools = await db.schools.find(query, {"_id": 0}).limit(50).to_list(50)
    return {"schools": schools}


@api.get("/schools/{school_id}")
async def get_school(school_id: str):
    s = await db.schools.find_one({"id": school_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="École introuvable")
    return s


# ------------- Admin: Import DB -------------
@api.post("/admin/import")
async def import_db(payload: ImportPayload, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    school_id = user.get("school_id")
    if not school_id:
        raise HTTPException(status_code=400, detail="Aucune école associée")

    inserted_students = 0
    inserted_classes = 0

    for c in payload.classes:
        name = (c.get("name") or c.get("class_name") or "").strip()
        if not name:
            continue
        exists = await db.classes.find_one({"school_id": school_id, "name": name})
        if not exists:
            await db.classes.insert_one({
                "id": str(uuid.uuid4()),
                "school_id": school_id,
                "name": name,
                "level": c.get("level", ""),
                "created_at": now_iso(),
            })
            inserted_classes += 1

    for s in payload.students:
        first = (s.get("first_name") or s.get("prenom") or "").strip()
        last = (s.get("last_name") or s.get("nom") or "").strip()
        klass = (s.get("class_name") or s.get("classe") or "").strip()
        if not first or not last:
            continue
        # Auto-create class if missing
        if klass:
            existsc = await db.classes.find_one({"school_id": school_id, "name": klass})
            if not existsc:
                await db.classes.insert_one({
                    "id": str(uuid.uuid4()),
                    "school_id": school_id,
                    "name": klass,
                    "level": "",
                    "created_at": now_iso(),
                })

        doc = {
            "id": str(uuid.uuid4()),
            "school_id": school_id,
            "first_name": first,
            "last_name": last,
            "class_name": klass,
            "matricule": s.get("matricule", ""),
            "date_of_birth": s.get("date_of_birth", ""),
            "parent_username": s.get("parent_username", ""),
            "parent_contact": s.get("parent_contact", ""),
            "created_at": now_iso(),
        }
        if s.get("parent_password"):
            doc["parent_password_hash"] = hash_password(s["parent_password"])
        await db.students.insert_one(doc)
        inserted_students += 1

    return {"ok": True, "inserted_students": inserted_students, "inserted_classes": inserted_classes}


# ------------- Admin: Students & Classes -------------
@api.get("/admin/students")
async def list_students(user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"))):
    items = await db.students.find({"school_id": user["school_id"]}, {"_id": 0, "parent_password_hash": 0}).to_list(2000)
    return {"students": items}


@api.post("/admin/students")
async def create_student(payload: StudentIn, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["school_id"] = user["school_id"]
    doc["created_at"] = now_iso()
    if doc.get("parent_password"):
        doc["parent_password_hash"] = hash_password(doc.pop("parent_password"))
    else:
        doc.pop("parent_password", None)
    await db.students.insert_one(doc)
    return {"id": doc["id"], "ok": True}


@api.patch("/admin/students/{student_id}/parent-credentials")
async def set_parent_creds(student_id: str, payload: ParentCredsIn, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    result = await db.students.update_one(
        {"id": student_id, "school_id": user["school_id"]},
        {"$set": {
            "parent_username": payload.username,
            "parent_password_hash": hash_password(payload.password),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Élève introuvable")
    return {"ok": True}


@api.delete("/admin/students/{student_id}")
async def delete_student(student_id: str, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    await db.students.delete_one({"id": student_id, "school_id": user["school_id"]})
    return {"ok": True}


@api.get("/admin/classes")
async def list_classes(user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"))):
    items = await db.classes.find({"school_id": user["school_id"]}, {"_id": 0}).to_list(200)
    return {"classes": items}


@api.post("/admin/classes")
async def create_class(payload: ClassIn, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["school_id"] = user["school_id"]
    doc["created_at"] = now_iso()
    await db.classes.insert_one(doc)
    return {"id": doc["id"], "ok": True}


# ------------- Admin: QR Tokens for parent access -------------
@api.post("/admin/qr-tokens")
async def create_qr_token(payload: QRTokenIn, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    token = str(uuid.uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=payload.duration_hours)).isoformat()
    doc = {
        "token": token,
        "school_id": user["school_id"],
        "created_by": user["id"],
        "duration_hours": payload.duration_hours,
        "expires_at": expires_at,
        "created_at": now_iso(),
        "active": True,
    }
    await db.qr_tokens.insert_one(doc)
    return {"token": token, "expires_at": expires_at, "school_id": user["school_id"]}


@api.get("/admin/qr-tokens")
async def list_qr_tokens(user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    items = await db.qr_tokens.find({"school_id": user["school_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"tokens": items}


@api.delete("/admin/qr-tokens/{token}")
async def revoke_qr_token(token: str, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN"))):
    await db.qr_tokens.update_one({"token": token, "school_id": user["school_id"]}, {"$set": {"active": False}})
    return {"ok": True}


# ------------- Parent QR lookup -------------
@api.get("/parent/qr-info/{token}")
async def qr_info(token: str):
    t = await db.qr_tokens.find_one({"token": token, "active": True}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="QR code invalide ou révoqué")
    try:
        exp = datetime.fromisoformat(t["expires_at"])
    except Exception:
        exp = datetime.now(timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="QR code expiré")
    school = await db.schools.find_one({"id": t["school_id"]}, {"_id": 0})
    classes = await db.classes.find({"school_id": t["school_id"]}, {"_id": 0, "name": 1}).to_list(200)
    return {"school": school, "classes": [c["name"] for c in classes], "expires_at": t["expires_at"]}


@api.post("/parent/lookup")
async def parent_lookup(payload: ParentLookupIn):
    t = await db.qr_tokens.find_one({"token": payload.token, "active": True})
    if not t:
        raise HTTPException(status_code=404, detail="QR code invalide")
    try:
        exp = datetime.fromisoformat(t["expires_at"])
    except Exception:
        exp = datetime.now(timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="QR code expiré")

    name = payload.student_name.strip().lower()
    students = await db.students.find({
        "school_id": t["school_id"],
        "class_name": payload.class_name,
    }, {"_id": 0, "parent_password_hash": 0}).to_list(500)

    matches = [s for s in students if name and (name in s["first_name"].lower() or name in s["last_name"].lower() or name in f"{s['first_name']} {s['last_name']}".lower())]
    return {"students": matches, "school_id": t["school_id"]}


# ------------- Documents (Bulletins, Medical Receipts) -------------
@api.post("/documents/bulletin")
async def create_bulletin(payload: BulletinIn, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"))):
    doc_id = str(uuid.uuid4())
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    doc = {
        "id": doc_id,
        "type": "BULLETIN",
        "school_id": user["school_id"],
        "school_name": school.get("name") if school else "",
        "issued_by": user["id"],
        "issued_at": now_iso(),
        "data": payload.model_dump(),
        "official": True,
    }
    await db.documents.insert_one(doc)
    return {"id": doc_id, "verify_url": f"{os.environ.get('FRONTEND_URL', '')}/verify/{doc_id}"}


@api.post("/documents/medical")
async def create_medical(payload: MedicalReceiptIn, user: Dict[str, Any] = Depends(require_roles("SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"))):
    doc_id = str(uuid.uuid4())
    school = await db.schools.find_one({"id": user["school_id"]}, {"_id": 0})
    doc = {
        "id": doc_id,
        "type": "MEDICAL_RECEIPT",
        "school_id": user["school_id"],
        "school_name": school.get("name") if school else "",
        "issued_by": user["id"],
        "issued_at": now_iso(),
        "data": payload.model_dump(),
        "official": True,
    }
    await db.documents.insert_one(doc)
    return {"id": doc_id, "verify_url": f"{os.environ.get('FRONTEND_URL', '')}/verify/{doc_id}"}


@api.get("/documents/verify/{doc_id}")
async def verify_document(doc_id: str):
    d = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not d:
        return JSONResponse(status_code=404, content={"official": False, "detail": "Document non trouvé"})
    # Mask sensitive info
    data = d.get("data", {})
    masked = {
        "student_name": data.get("student_name", ""),
        "class_name": data.get("class_name", ""),
        "term": data.get("term"),
        "year": data.get("year"),
        "reason": data.get("reason"),
        "medic_name": data.get("medic_name"),
        "clearance": data.get("clearance"),
        "average": data.get("average"),
    }
    return {
        "official": True,
        "id": d["id"],
        "type": d["type"],
        "school_name": d.get("school_name"),
        "issued_at": d.get("issued_at"),
        "data": masked,
    }


# ------------- Startup: seed super admin -------------
@app.on_event("startup")
async def startup():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    await db.users.create_index("email", unique=True)
    await db.schools.create_index("id", unique=True)
    await db.students.create_index([("school_id", 1), ("class_name", 1)])
    await db.qr_tokens.create_index("token", unique=True)
    await db.documents.create_index("id", unique=True)

    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        # Create a demo school for the platform owner
        school_id = str(uuid.uuid4())
        await db.schools.insert_one({
            "id": school_id,
            "name": "École Démo Destock",
            "city": "Kinshasa",
            "region": "RDC",
            "code": school_id[:8].upper(),
            "logo_url": "",
            "active": True,
            "created_at": now_iso(),
        })
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Super Admin",
            "role": "SUPER_ADMIN",
            "school_id": school_id,
            "created_at": now_iso(),
        })
        logger.info(f"Seeded super admin: {admin_email}")
    else:
        # Refresh password if changed
        if not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "*"), "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
