import Upload(uploadFile)
import Download(downloadFile)
import Network.HTTP
import Network.Browser
import Network.URI(parseURI,URI)
import qualified Text.JSON as J
import qualified Text.JSON.String as J
import qualified Data.Set as S
import Data.List(sort,nub)
import Maybe(fromJust)
import Data.Either(rights)
import Control.Monad(forM_,forM)
import Control.Applicative((<$>),(<*>))
import Control.Exception(bracket,finally)
import Directory(getCurrentDirectory)
import qualified Data.ByteString as BS

import Test.QuickCheck
import Test.QuickCheck.Monadic
import qualified Test.HUnit as T

main = do
    createAndDeleteUserContent
    uploadAndThenDownload
    q 10 $ label "prop_createAndDeleteUsers" prop_createAndDeleteUsers
    q 10 $ label "prop_partialDownload" prop_partialDownload
      where
        q n = quickCheckWith $ stdArgs { maxSuccess = n }

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

prop_partialDownload = monadicIO $ do
  let user = "testUserXYZ123"
  path <- run $ getCurrentDirectory
  let file = "/goldenSample.txt"
  fileContent <- run $ readFile $ path ++ file
  let endPos = length fileContent - 1
  s <- pick $ listOf $ choose (0,endPos) :: PropertyM IO [Int]
  let pairs = mkPairs $ nub $ sort $ [0,endPos] ++ s
  res <- run $ downloadParts user pairs path file
  assert $ (fileContent == res)

mkPairs :: [Int] -> [(Int,Int)]
mkPairs xs = go xs 0 []
  where go [] _ r = reverse r
        go (x:xs) i r = go xs (x+1) ((i,x):r)

downloadParts user xs path file =
    bracket (createUser user) (\_->eraseOneUser user) $ \_->do
            uploadFile (uploadFileUri user) (path ++ file)
            results <- forM xs $ \range->
              downloadFile range (downloadFileFromUserUri user file)
            return $ concat (rights results)

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
    bracket (createUser user) (\_->eraseOneUser user) $ \_->do
            path <- getCurrentDirectory
            let file = "/goldenSample.txt"
            contentA <- getUserContent user
            uploadFile (uploadFileUri user) (path ++ file)
            contentB <- getUserContent user
            deleteFromUser user file
            contentC <- getUserContent user
            T.assertEqual "content before and after should be the same" contentA contentC

deleteAllFilesFromUser :: IO ()
deleteAllFilesFromUser = do
    let user = "testUserXYZ123"
    bracket (createUser user) (\_->eraseOneUser user) $ \_->do
            path <- getCurrentDirectory
            let file = "/goldenSample.txt"
            contentA <- getUserContent user
            uploadFile (uploadFileUri user) (path ++ file)
            contentB <- getUserContent user
            deleteFromUser user file
            contentC <- getUserContent user
            T.assertEqual "content before and after should be the same" contentA contentC
            
uploadAndThenDownload :: IO ()
uploadAndThenDownload = do
    let user = "testUserXYZ123"
    bracket (createUser user) (\_->eraseOneUser user) $ \_->do
            path <- getCurrentDirectory
            let file = "/goldenSample.txt"
            fileContent <- readFile $ path ++ file
            uploadFile (uploadFileUri user) (path ++ file)
            let range = (0,length fileContent - 1)
            Right res <- downloadFile range (downloadFileFromUserUri user file)
            deleteFromUser user file
            let equal = fileContent == res
            T.assertEqual "upload/download content should be the same" fileContent res
    
  
serverUri x = parseURI $ "http://localhost:8080" ++ x
newUserUri = fromJust $ serverUri "/user/new"
listUsersUri = fromJust $ serverUri "/user/list"
eraseUserUri u = fromJust $ serverUri $ "/user/erase/" ++ (urlEncode u)
uploadFileUri u = fromJust $ serverUri $ "/user/upload/" ++ (urlEncode u)
downloadFileFromUserUri u f = fromJust $ serverUri $ "/user/get/" ++ (urlEncode u) ++ "/" ++ (urlEncode f)
userContentUri u = fromJust $ serverUri $ "/user/content/" ++ (urlEncode u)
deleteFileFromUserUri u f = fromJust $ serverUri $ "/user/delete/" ++ (urlEncode u) ++ "/" ++ (urlEncode f)
deleteContentFromUserUri u = fromJust $ serverUri $ "/user/clear/" ++ (urlEncode u)

-- /user/sha1/$USER   => get sha1 checksum for $USER

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

deleteAllUserContent :: String -> IO (J.Result [String])
deleteFromUser user = do
  putStrLn $ "delete everything from user:" ++ user
  let r = Request { rqURI = deleteContentFromUserUri user, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  rr <- simpleHTTP r >>= getResponseBody 
  return $ J.decode rr

