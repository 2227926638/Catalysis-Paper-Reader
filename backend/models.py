from sqlalchemy import Column, Integer, String, Text, DateTime, create_engine, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from dotenv import load_dotenv
import json

# 加载环境变量
load_dotenv()

# 获取数据库连接URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./literature_analysis.db")

# 创建数据库引擎
engine = create_engine(DATABASE_URL)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建基类
Base = declarative_base()

# 文档模型
class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    path = Column(String(255), nullable=False)
    upload_time = Column(DateTime, default=datetime.now)
    category = Column(String(100), nullable=False)
    status = Column(String(50), default="uploaded")
    
    # 关系
    analysis = relationship("Analysis", back_populates="document", uselist=False, cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "path": self.path,
            "uploadTime": self.upload_time.strftime("%Y-%m-%d %H:%M:%S"),
            "category": self.category,
            "status": self.status
        }

# 分析结果模型
class Analysis(Base):
    __tablename__ = "analyses"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    title = Column(String(255), nullable=True)
    authors = Column(Text, nullable=True)  # 存储为JSON字符串
    publication = Column(String(255), nullable=True)
    year = Column(String(10), nullable=True)
    abstract = Column(Text, nullable=True)
    keywords = Column(Text, nullable=True)  # 存储为JSON字符串
    content = Column(Text, nullable=True)  # 存储完整分析结果为JSON字符串
    raw_ai_response = Column(Text, nullable=True) # 存储原始AI响应内容
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 关系
    document = relationship("Document", back_populates="analysis")
    
    def to_dict(self):
        return {
            "id": self.id,
            "document_id": self.document_id,
            "title": self.title,
            "authors": json.loads(self.authors) if self.authors else [],
            "publication": self.publication,
            "year": self.year,
            "abstract": self.abstract,
            "keywords": json.loads(self.keywords) if self.keywords else [],
            "content": json.loads(self.content) if self.content else {}
        }

# 创建数据库表
def create_tables():
    Base.metadata.create_all(bind=engine)

# 获取数据库会话
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()