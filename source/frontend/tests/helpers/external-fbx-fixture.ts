const EXTERNAL_TEXTURE_FBX_SOURCE = `${';'.repeat(256)}
; FBX 7.4.0 project file
FBXHeaderExtension:  {
  FBXHeaderVersion: 1003
  FBXVersion: 7400
}
GlobalSettings:  {
  Version: 1000
  Properties70:  {
    P: "UpAxis", "int", "Integer", "",1
    P: "UpAxisSign", "int", "Integer", "",1
    P: "FrontAxis", "int", "Integer", "",2
    P: "FrontAxisSign", "int", "Integer", "",-1
    P: "CoordAxis", "int", "Integer", "",0
    P: "CoordAxisSign", "int", "Integer", "",1
    P: "UnitScaleFactor", "double", "Number", "",1
  }
}
Objects:  {
  Geometry: 1, "Geometry::Triangle", "Mesh" {
    Vertices: *9 {
      a: -50,0,0,50,0,0,0,100,0
    }
    PolygonVertexIndex: *3 {
      a: 0,1,-3
    }
    LayerElementNormal: 0 {
      Version: 101
      Name: ""
      MappingInformationType: "ByPolygonVertex"
      ReferenceInformationType: "Direct"
      Normals: *9 {
        a: 0,0,1,0,0,1,0,0,1
      }
    }
    LayerElementUV: 0 {
      Version: 101
      Name: "UVChannel_1"
      MappingInformationType: "ByPolygonVertex"
      ReferenceInformationType: "IndexToDirect"
      UV: *6 {
        a: 0,0,1,0,0.5,1
      }
      UVIndex: *3 {
        a: 0,1,2
      }
    }
    LayerElementMaterial: 0 {
      Version: 101
      Name: ""
      MappingInformationType: "AllSame"
      ReferenceInformationType: "IndexToDirect"
      Materials: *1 {
        a: 0
      }
    }
    Layer: 0 {
      Version: 100
      LayerElement: {
        Type: "LayerElementNormal"
        TypedIndex: 0
      }
      LayerElement: {
        Type: "LayerElementMaterial"
        TypedIndex: 0
      }
      LayerElement: {
        Type: "LayerElementUV"
        TypedIndex: 0
      }
    }
  }
  Model: 2, "Model::Triangle", "Mesh" {
    Version: 232
    Properties70:  {
      P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
      P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
      P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
    }
    Shading: T
    Culling: "CullingOff"
  }
  Material: 3, "Material::Material", "" {
    Version: 102
    ShadingModel: "phong"
    MultiLayer: 0
    Properties70:  {
      P: "DiffuseColor", "Color", "", "A",1,1,1
      P: "DiffuseFactor", "Number", "", "A",1
    }
  }
  Texture: 4, "Texture::albedo", "" {
    Type: "TextureVideoClip"
    Version: 202
    TextureName: "Texture::albedo"
    Media: "Video::albedo"
    FileName: "albedo.png"
    RelativeFilename: "albedo.png"
  }
  Video: 5, "Video::albedo", "Clip" {
    Type: "Clip"
    Properties70:  {
      P: "Path", "KString", "XRefUrl", "", "albedo.png"
    }
    UseMipMap: 0
    Filename: "albedo.png"
    RelativeFilename: "albedo.png"
  }
}
Connections:  {
  C: "OO",1,2
  C: "OO",2,0
  C: "OO",3,2
  C: "OO",5,4
  C: "OP",4,3,"DiffuseColor"
}
`;

const EXTERNAL_TEXTURE_FBX = EXTERNAL_TEXTURE_FBX_SOURCE.replace(
  /^( +)/gm,
  (spaces) => '\t'.repeat(Math.floor(spaces.length / 2)),
);

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY2BgYPgPAAEEAQBwIGULAAAAAElFTkSuQmCC',
  'base64',
);

export function createExternalFbxFixtureInputs() {
  return [
    {
      name: 'external-textured.fbx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(EXTERNAL_TEXTURE_FBX),
    },
    {
      name: 'albedo.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    },
  ];
}
