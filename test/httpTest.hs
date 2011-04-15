import Upload(uploadFile)
import Network.HTTP
import Network.Browser
import Network.URI(parseURI,URI)
import qualified Text.JSON as J
import qualified Text.JSON.String as J
import qualified Data.Set as S
import Maybe(fromJust)
import Control.Monad(forM_)
import Control.Applicative((<$>),(<*>))
import Control.Exception(bracket,finally)
import Directory(getCurrentDirectory)

import Test.Framework (defaultMain, testGroup)
import Test.Framework.Providers.HUnit
import Test.Framework.Providers.QuickCheck2 (testProperty)

import Test.QuickCheck
import Test.QuickCheck.Monadic(monadicIO,run,assert)
import qualified Test.HUnit as T

main = do
    createAndDeleteUserContent
    q 10 $ label "prop_createAndDeleteUsers" prop_createAndDeleteUsers
    -- defaultMain tests
      where
        q n = quickCheckWith $ stdArgs { maxSuccess = n }

tests = [
        testGroup "rest api Group" [
                -- testProperty "create/deleta users property" prop_createAndDeleteUsers
            ]
    ]

newtype User = User { name :: String } deriving (Show)
instance Arbitrary User where
  arbitrary = sized crowd
    where validStarters = "-_.()" ++ ['A'..'Z'] ++ ['a'..'z'] ++ ['0'..'9'] 
          valid = ' ':validStarters
          crowd 0 = (User . return) `fmap` elements validStarters
          crowd n | n > 50 = resize 50 arbitrary
                  | otherwise = do
                      name <- vectorOf n $ elements valid
                      starter <- elements validStarters
                      end <- elements validStarters
                      return $ User $ starter:name ++ [end]

prop_createAndDeleteUsers ::  [User] -> Property
prop_createAndDeleteUsers users = monadicIO $ do
    let names = map (\(User n)->n) users
    (J.Ok initialUsers) <- run $ getUsers >>= return . (fmap S.fromList)
    let distinctUsers = S.toList $ S.fromList names S.\\ initialUsers
    forM_ distinctUsers $ \u -> run $ putStrLn $ "user:" ++ u
    forM_ distinctUsers $ \user -> run $ createUser user
    forM_ distinctUsers $ \user -> run $ eraseOneUser user
    (J.Ok eventualUsers) <- run $ getUsers >>= return . (fmap S.fromList)
    assert $ (eventualUsers S.\\ initialUsers) == S.empty

data MusicItem = Item { 
	            itemName :: String,
	            modified :: String,
	            size :: Int
	            } deriving (Eq,Ord,Show)
instance J.JSON MusicItem where
  showJSON (Item name mod size) = J.makeObj
    [("name", J.showJSON name)
    ,("modified", J.showJSON mod)
    ,("size", J.showJSON size)
    ]
  readJSON (J.JSObject obj) = 
    Item <$> f "name" <*> f "modified" <*> f "size"      
      where f x = mLookup x jsonObjAssoc >>= J.readJSON
            jsonObjAssoc = J.fromJSObject obj
            
mLookup a as = maybe (fail $ "No such element: " ++ a) return (lookup a as)

createAndDeleteUserContent :: IO ()
createAndDeleteUserContent = do
    let user = "testUserXYZ123"
    bracket (createUser user) (\_->eraseOneUser user)
      (\_->do
            path <- getCurrentDirectory
            let file = "/goldenSample.txt"
            contentA <- getUserContent user
            uploadFile (uploadFileUri user) (path ++ file)
            contentB <- getUserContent user
            deleteFromUser user file
            contentC <- getUserContent user
            putStrLn $ show contentA
            putStrLn $ show contentB
            putStrLn $ show contentC
            T.assertEqual "content before and after should be the same" contentA contentC
       )     
    
  
serverUri x = parseURI $ "http://localhost:8080" ++ x
newUserUri = fromJust $ serverUri "/user/new"
listUsersUri = fromJust $ serverUri "/user/list"
eraseUserUri u = fromJust $ serverUri $ "/user/erase/" ++ (urlEncode u)
uploadFileUri u = fromJust $ serverUri $ "/user/upload/" ++ (urlEncode u)
userContentUri u = fromJust $ serverUri $ "/user/content/" ++ (urlEncode u)
deleteFileFromUserUri u f = fromJust $ serverUri $ "/user/delete/" ++ (urlEncode u) ++ "/" ++ (urlEncode f)

-- for specific users:
-- /user/sha1/$USER   => get sha1 checksum for $USER
-- list of user files
-- /user/clear/$USER => delete all files of $USER
-- /user/get/$USER/$FILE => start download of $FILE from $USER

getUsers ::  IO (J.Result [String])
getUsers = do 
  let x = listUsersUri
  putStrLn $ "getUsers->" ++ show x
  let r = Request { rqURI = x, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  simpleHTTP r >>= getResponseBody >>= return . J.decode

getUserContent ::  [Char] -> IO [MusicItem]
getUserContent user = do
  putStrLn $ "get content from user:" ++ user
  let r = Request { rqURI = userContentUri user, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  simpleHTTP r >>= getResponseBody >>= return . getX
    where getX s = let (J.Ok x) = J.decode s :: J.Result [MusicItem] in x


createUser ::  String -> IO ()
createUser user = do
  putStrLn $ "createUser:" ++ user
  let f = Form POST newUserUri [("name", user)]
  rsp <- browse $ do { setAllowRedirects True; request $ formToRequest f}
  return ()

eraseOneUser :: String -> IO (J.Result [String])
eraseOneUser user = do
  putStrLn $ "delete user:" ++ user
  let r = Request { rqURI = eraseUserUri user, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  rr <- simpleHTTP r >>= getResponseBody 
  return $ J.decode rr

deleteFromUser :: String -> String -> IO (J.Result [String])
deleteFromUser user f = do
  putStrLn $ "delete " ++ f ++ " from user:" ++ user
  let r = Request { rqURI = deleteFileFromUserUri user f, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  rr <- simpleHTTP r >>= getResponseBody 
  return $ J.decode rr

